import { randomInt, timingSafeEqual } from "node:crypto";

/**
 * Bonnetjes-inbox — pure hulpfuncties (getest, geen database).
 *
 * Elke account-eigenaar heeft een uniek adres `<token>@<INBOUND_EMAIL_DOMAIN>`.
 * Inkomende mail (via een inbound-webhook van de mailprovider) wordt
 * genormaliseerd naar `InboundMessage`; elke bruikbare bijlage wordt een
 * inbox-item dat de gebruiker in Uitgaven verwerkt.
 */

export const INBOUND_DOMAIN = () => process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? "in.saldova.nl";

/** Maximale bijlagegrootte (5 MB) — groter wordt overgeslagen. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** Maximaal aantal bijlagen per mail dat we verwerken. */
export const MAX_ATTACHMENTS = 10;

export const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

export interface InboundAttachment {
  fileName: string;
  mimeType: string;
  /** Base64 (zonder data:-prefix) */
  base64: string;
  size: number;
}

/** Uitkomst van één afzendercontrole (SPF, DKIM of DMARC) zoals de provider die meldt. */
export type AuthResult = "pass" | "fail" | "neutral";

/** Afzendercontroles van de mailprovider; alleen ingevuld als de payload ze bevat. */
export interface SenderAuth {
  spf?: AuthResult;
  dkim?: AuthResult;
  dmarc?: AuthResult;
}

export interface InboundMessage {
  to: string[];
  from: string;
  subject: string;
  text: string;
  attachments: InboundAttachment[];
  /** SPF/DKIM/DMARC-uitslag, als de provider die meestuurt. */
  auth?: SenderAuth;
}

/** Tokens: 14 tekens uit een alfabet zonder verwarrende tekens, altijd lowercase. */
const TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
/**
 * Het token is het enige "geheim" van het inbox-adres, dus standaard met de
 * cryptografische randomInt. De parameter is er alleen voor tests.
 */
export function generateInboundToken(pick: (max: number) => number = randomInt): string {
  let out = "";
  for (let i = 0; i < 14; i++) out += TOKEN_ALPHABET[pick(TOKEN_ALPHABET.length)];
  return out;
}

/** Vergelijkt twee teksten in constante tijd (lengte eerst, daarna timingSafeEqual). */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Klopt de Authorization-header van de webhook? Twee vormen:
 *  - `Bearer <INBOUND_WEBHOOK_SECRET>` (eigen header, bijv. een Cloudflare Email Worker);
 *  - `Basic <base64(naam:INBOUND_WEBHOOK_SECRET)>` voor providers die alleen
 *    https://naam:geheim@…-adressen ondersteunen (zoals Mailgun en SendGrid).
 *    De naam maakt niet uit; het wachtwoord moet het geheim zijn.
 * Het geheim in de URL (`?secret=`) werkt bewust niet meer: dat komt in logs terecht.
 */
export function webhookAuthorized(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!header || !secret) return false;
  const h = header.trim();
  const bearer = h.match(/^bearer\s+(.+)$/i);
  if (bearer) return safeEqual(bearer[1].trim(), secret);
  const basic = h.match(/^basic\s+(.+)$/i);
  if (basic) {
    const decoded = Buffer.from(basic[1].trim(), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    return colon >= 0 && safeEqual(decoded.slice(colon + 1), secret);
  }
  return false;
}

const AUTH_WORDS = ["pass", "fail", "softfail", "hardfail", "neutral", "none", "temperror", "permerror", "policy"];

/** Eén uitslag ("pass", "Pass (sender SPF authorized)", "softfail", "{@domein.nl : pass}") -> AuthResult. */
export function parseAuthResult(raw: unknown): AuthResult | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  // SendGrid-stijl DKIM: "{@domein.nl : pass}" (soms meerdere, gescheiden door komma's).
  const braced = [...v.matchAll(/:\s*([a-z]+)\s*\}/g)].map((m) => m[1]).filter((w) => AUTH_WORDS.includes(w));
  const word = braced.length ? (braced.includes("pass") ? "pass" : braced[0]) : v.split(/[\s;,(]/)[0];
  if (word === "pass") return "pass";
  if (word === "fail" || word === "softfail" || word === "hardfail") return "fail";
  if (AUTH_WORDS.includes(word)) return "neutral";
  return undefined;
}

/** Haalt spf=/dkim=/dmarc= uit een Authentication-Results-header. */
export function parseAuthenticationResults(raw: unknown): SenderAuth {
  if (typeof raw !== "string") return {};
  const text = raw.toLowerCase();
  const out: SenderAuth = {};
  for (const method of ["spf", "dkim", "dmarc"] as const) {
    const found = [...text.matchAll(new RegExp(`\\b${method}=([a-z]+)`, "g"))]
      .map((m) => parseAuthResult(m[1]))
      .filter((r): r is AuthResult => !!r);
    if (found.length) out[method] = found.includes("pass") ? "pass" : found[0];
  }
  return out;
}

/**
 * Zoekt SPF/DKIM/DMARC in de velden die gangbare providers meesturen:
 * SendGrid (`SPF`, `dkim`), Mailgun (`X-Mailgun-Spf`, `X-Mailgun-Dkim-Check-Result`),
 * Postmark (`Headers: [{Name, Value}]`), losse `spf`/`dkim`/`dmarc`-velden, of
 * een `Authentication-Results`/`Received-SPF`-header. Leeg als er niets in staat.
 */
export function extractSenderAuth(get: (key: string) => unknown, headers?: unknown): SenderAuth {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const r = parseAuthResult(get(k));
      if (r) return r;
    }
    return undefined;
  };
  const out: SenderAuth = {
    spf: pick("spf", "SPF", "X-Mailgun-Spf", "x-mailgun-spf"),
    dkim: pick("dkim", "DKIM", "X-Mailgun-Dkim-Check-Result", "x-mailgun-dkim-check-result"),
    dmarc: pick("dmarc", "DMARC"),
  };

  // Headers als tekst (SendGrid: ruwe headers; Mailgun: JSON-lijst), als lijst
  // ({Name,Value} / {name,value} / [naam, waarde]) of als object.
  if (typeof headers === "string") headers = parseHeaderText(headers);
  const headerValue = (name: string): string | undefined => {
    if (Array.isArray(headers)) {
      for (const h of headers) {
        if (Array.isArray(h) && String(h[0]).toLowerCase() === name) return String(h[1] ?? "");
        const o = (h ?? {}) as Record<string, unknown>;
        const key = o.Name ?? o.name;
        if (typeof key === "string" && key.toLowerCase() === name) return String(o.Value ?? o.value ?? "");
      }
    } else if (headers && typeof headers === "object") {
      for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
        if (k.toLowerCase() === name) return Array.isArray(v) ? v.map(String).join("; ") : String(v ?? "");
      }
    }
    return undefined;
  };
  const ar = parseAuthenticationResults(
    headerValue("authentication-results") ?? get("Authentication-Results") ?? get("authentication-results"),
  );
  out.spf ??= ar.spf ?? parseAuthResult(headerValue("received-spf") ?? get("Received-SPF"));
  out.dkim ??= ar.dkim;
  out.dmarc ??= ar.dmarc;

  for (const k of ["spf", "dkim", "dmarc"] as const) if (!out[k]) delete out[k];
  return out;
}

/** Headers als tekst -> lijst [naam, waarde]. Werkt voor een JSON-lijst en voor ruwe "Naam: waarde"-regels. */
function parseHeaderText(raw: string): [string, string][] {
  const t = raw.trim();
  if (t.startsWith("[")) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.filter(Array.isArray).map((h) => [String(h[0]), String(h[1] ?? "")]);
    } catch {
      // geen JSON: dan als ruwe headers lezen
    }
  }
  const out: [string, string][] = [];
  for (const line of t.split(/\r?\n/)) {
    if (/^\s/.test(line) && out.length) {
      out[out.length - 1][1] += ` ${line.trim()}`; // vervolgregel
      continue;
    }
    const colon = line.indexOf(":");
    if (colon > 0) out.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return out;
}

/**
 * Oordeel over de afzender op basis van de controles:
 *  - "pass": DMARC, DKIM of SPF geslaagd;
 *  - "fail": DMARC gezakt, of niets geslaagd en minstens één controle gezakt
 *    (dan is het afzenderadres vrijwel zeker nagemaakt);
 *  - "unknown": geen of alleen neutrale uitslagen (de provider stuurt niets
 *    mee, of het domein heeft geen SPF/DKIM). Dan geldt alleen de adrescontrole.
 */
export function senderAuthVerdict(auth: SenderAuth | undefined): "pass" | "fail" | "unknown" {
  if (!auth) return "unknown";
  if (auth.dmarc === "fail") return "fail";
  const results = [auth.dmarc, auth.dkim, auth.spf];
  if (results.includes("pass")) return "pass";
  if (results.includes("fail")) return "fail";
  return "unknown";
}

export function inboundAddress(token: string): string {
  return `${token}@${INBOUND_DOMAIN()}`;
}

/** Haalt "naam <adres>"-vormen en hoofdletters weg: alleen het kale adres, lowercase. */
export function bareAddress(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

/**
 * Zoekt in de ontvangers het inbound-token (local part). Plus-adressering
 * (`token+winkel@…`) wordt getolereerd. Domein moet kloppen; null als geen match.
 */
export function extractToken(recipients: string[], domain: string = INBOUND_DOMAIN()): string | null {
  const d = domain.toLowerCase();
  for (const r of recipients) {
    const addr = bareAddress(r);
    const at = addr.lastIndexOf("@");
    if (at < 0 || addr.slice(at + 1) !== d) continue;
    const local = addr.slice(0, at).split("+")[0];
    if (/^[a-z0-9]{8,32}$/.test(local)) return local;
  }
  return null;
}

/** Alleen foto's/PDF's binnen de limieten, max MAX_ATTACHMENTS. */
export function usableAttachments(list: InboundAttachment[]): InboundAttachment[] {
  return list
    .filter((a) => ACCEPTED_MIME.has(a.mimeType.toLowerCase().split(";")[0]) && a.size > 0 && a.size <= MAX_ATTACHMENT_BYTES)
    .slice(0, MAX_ATTACHMENTS);
}

/** Is de afzender een adres van dit account (eigenaar of teamlid)? Beschermt tegen spam/verkeerde bonnen. */
export function senderAllowed(from: string, accountEmails: string[]): boolean {
  const f = bareAddress(from);
  return accountEmails.some((e) => e.trim().toLowerCase() === f);
}

/** Onderwerp/tekst inkorten voor opslag (hint in de inbox). */
export function shortText(s: string | null | undefined, max = 1000): string | null {
  if (!s) return null;
  const t = s.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? t.slice(0, max) + "…" : t || null;
}

/**
 * Normaliseert een JSON-webhookbody. Ondersteunt:
 *  - ons eigen formaat: { to, from, subject, text, attachments:[{filename,contentType,content}] }
 *  - Resend "email.received": { type, data: { to, from, subject, text, attachments:[...] } }
 *  - Postmark-achtig: { ToFull/To, From, Subject, TextBody, Attachments:[{Name,ContentType,Content}] }
 */
export function normalizeJson(body: unknown): InboundMessage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const src = (b.type === "email.received" && b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : b);

  const toRaw = src.to ?? src.To ?? src.ToFull ?? src.recipients;
  const to = Array.isArray(toRaw)
    ? toRaw.map((x) => (typeof x === "string" ? x : String((x as Record<string, unknown>)?.Email ?? (x as Record<string, unknown>)?.email ?? "")))
    : typeof toRaw === "string"
      ? toRaw.split(",")
      : [];
  const from = String(src.from ?? src.From ?? src.sender ?? "");
  const subject = String(src.subject ?? src.Subject ?? "");
  const text = String(src.text ?? src.TextBody ?? src["stripped-text"] ?? src["body-plain"] ?? "");

  const attRaw = src.attachments ?? src.Attachments;
  const attachments: InboundAttachment[] = Array.isArray(attRaw)
    ? attRaw
        .map((a) => {
          const o = (a ?? {}) as Record<string, unknown>;
          const base64 = String(o.content ?? o.Content ?? o.data ?? "").replace(/^data:[^,]+,/, "");
          const size = Number(o.size ?? o.ContentLength ?? Math.floor((base64.length * 3) / 4));
          return {
            fileName: String(o.filename ?? o.fileName ?? o.Name ?? o.name ?? "bijlage"),
            mimeType: String(o.contentType ?? o.content_type ?? o.ContentType ?? o.type ?? "application/octet-stream"),
            base64,
            size,
          };
        })
        .filter((a) => a.base64.length > 0)
    : [];

  if (to.length === 0 && !from) return null;
  const auth = extractSenderAuth((k) => src[k], src.headers ?? src.Headers);
  return { to: to.filter(Boolean), from, subject, text, attachments, ...(Object.keys(auth).length ? { auth } : {}) };
}
