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

export interface InboundMessage {
  to: string[];
  from: string;
  subject: string;
  text: string;
  attachments: InboundAttachment[];
}

/** Tokens: 14 tekens uit een alfabet zonder verwarrende tekens, altijd lowercase. */
const TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function generateInboundToken(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 14; i++) out += TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length)];
  return out;
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
  return { to: to.filter(Boolean), from, subject, text, attachments };
}
