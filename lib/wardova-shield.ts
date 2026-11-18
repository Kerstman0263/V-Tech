/**
 * Wardova Shield agent v1
 *
 * Applicatie-firewall die in je eigen site meedraait. Geen dependencies: werkt overal waar
 * de Web-API's Request/Response, fetch en crypto.subtle bestaan (Next.js proxy/middleware,
 * Node 20+, Bun, Deno, Cloudflare Workers).
 *
 * Next.js 16 (proxy.ts) of Next.js ≤15 (middleware.ts):
 *
 *   import { NextResponse, type NextRequest } from "next/server";
 *   import { createShield } from "./wardova-shield";
 *
 *   const shield = createShield({ siteKey: process.env.WARDOVA_SHIELD_KEY! });
 *
 *   export async function proxy(request: NextRequest) {
 *     const blocked = await shield.handle(request);
 *     return blocked ?? NextResponse.next();
 *   }
 *
 * Belangrijk: Shield vertrouwt op x-real-ip / x-forwarded-for. Draai je site achter een
 * proxy of platform (Vercel, Cloudflare, nginx) die deze headers zelf zet.
 */

export type ShieldMode = "monitor" | "protect" | "fortress";

type RuleKind = "ip_block" | "ip_allow" | "path_block" | "ua_block" | "country_block";
type ShieldEventAction = "blocked" | "rate_limited" | "challenged" | "flagged";

type RemoteConfig = {
  mode: ShieldMode;
  rateLimitPerMinute: number;
  blockBadBots: boolean;
  blockProbes: boolean;
  rules: { kind: RuleKind; value: string }[];
};

type CompiledConfig = {
  mode: ShieldMode;
  rateLimitPerMinute: number;
  blockBadBots: boolean;
  blockProbes: boolean;
  allow: IpMatcher;
  block: IpMatcher;
  paths: string[];
  agents: string[];
  countries: Set<string>;
};

type IpMatcher = { exact: Set<string>; cidrs: { base: number; mask: number }[] };

type QueuedEvent = {
  ip: string;
  action: ShieldEventAction;
  reason: string;
  path: string;
  ua: string;
  country: string;
  hits: number;
};

export type ShieldOptions = {
  /** Sitesleutel uit het Wardova-dashboard (wsk_...). Bewaar hem als environment variable. */
  siteKey: string;
  /** Alleen aanpassen voor een eigen Wardova-installatie. */
  endpoint?: string;
  /**
   * Altijd in de Monitor-stand, wat er in Wardova ook is ingesteld: Shield meldt
   * verdachte verzoeken, maar blokkeert, beperkt of controleert nooit. De eerste
   * aanvraag wacht dan ook niet op de configuratie van Wardova.
   */
  monitorOnly?: boolean;
};

export type ShieldContext = {
  /** Geef event.waitUntil / ctx.waitUntil door als je platform dat heeft, zodat meldingen altijd aankomen. */
  waitUntil?: (promise: Promise<unknown>) => void;
};

const DEFAULT_ENDPOINT = "https://wardova.vercel.app";
const CONFIG_TTL_MS = 30_000;
const CONFIG_TIMEOUT_MS = 1_500;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE = 100;
const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 20_000;
const POW_BITS = 14;
const SEED_TTL_S = 120;
const CLEARANCE_TTL_S = 3_600;

// Paden waar echte bezoekers nooit komen, maar scanners altijd.
const PROBE_PATHS = [
  "/.env", "/.git", "/.aws", "/.ssh", "/.svn", "/.hg", "/.vscode", "/.ds_store",
  "/wp-config.php.", "/wp-config.php~", "/phpmyadmin", "/pma/", "/adminer",
  "/vendor/phpunit", "/cgi-bin/", "/server-status", "/actuator/", "/.well-known/../",
  "/etc/passwd", "/boaform", "/hnap1", "/autodiscover/autodiscover.xml",
];

const BAD_AGENTS = [
  "sqlmap", "nikto", "nmap", "masscan", "zgrab", "wpscan", "nuclei", "dirbuster", "gobuster",
  "acunetix", "havij", "nessus", "openvas", "fimap", "hydra", "feroxbuster", "ffuf", "whatweb",
];

// De eigen scanner van Wardova: wordt gewoon gefilterd, maar niet gemeld of automatisch geband.
const OWN_SCANNER = "wardovascanner";

const FALLBACK: RemoteConfig = { mode: "monitor", rateLimitPerMinute: 120, blockBadBots: true, blockProbes: true, rules: [] };

const encoder = new TextEncoder();

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function buildMatcher(values: string[]): IpMatcher {
  const matcher: IpMatcher = { exact: new Set(), cidrs: [] };
  for (const raw of values) {
    const value = raw.trim().toLowerCase();
    const slash = value.indexOf("/");
    if (slash === -1) {
      matcher.exact.add(value);
      continue;
    }
    const base = ipv4ToInt(value.slice(0, slash));
    const bits = Number(value.slice(slash + 1));
    if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    matcher.cidrs.push({ base: (base & mask) >>> 0, mask });
  }
  return matcher;
}

function matchesIp(matcher: IpMatcher, ip: string): boolean {
  if (matcher.exact.has(ip)) return true;
  if (matcher.cidrs.length === 0) return false;
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return matcher.cidrs.some((cidr) => ((value & cidr.mask) >>> 0) === cidr.base);
}

function compile(config: RemoteConfig): CompiledConfig {
  const byKind = (kind: RuleKind) => config.rules.filter((rule) => rule.kind === kind).map((rule) => rule.value);
  return {
    mode: config.mode,
    rateLimitPerMinute: config.rateLimitPerMinute,
    blockBadBots: config.blockBadBots,
    blockProbes: config.blockProbes,
    allow: buildMatcher(byKind("ip_allow")),
    block: buildMatcher(byKind("ip_block")),
    paths: byKind("path_block").map((value) => value.toLowerCase()),
    agents: byKind("ua_block").map((value) => value.toLowerCase()),
    countries: new Set(byKind("country_block").map((value) => value.toUpperCase())),
  };
}

function isRemoteConfig(value: unknown): value is RemoteConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.mode === "monitor" || candidate.mode === "protect" || candidate.mode === "fortress") &&
    typeof candidate.rateLimitPerMinute === "number" &&
    typeof candidate.blockBadBots === "boolean" &&
    typeof candidate.blockProbes === "boolean" &&
    Array.isArray(candidate.rules)
  );
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function page(title: string, body: string, status: number, headers: Record<string, string> = {}): Response {
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#03050b;color:#e8edf8;font:16px/1.5 system-ui,sans-serif}main{max-width:26rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#a9b4cf;margin:.25rem 0}small{color:#7a88ab}</style></head><body><main>${body}<p><small>Beveiligd door Wardova Shield</small></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-wardova-shield": "1", ...headers },
  });
}

export function createShield(options: ShieldOptions) {
  if (!/^wsk_[a-f0-9]{48}$/.test(options.siteKey ?? "")) {
    throw new Error("Wardova Shield: ongeldige of ontbrekende siteKey (verwacht wsk_...)");
  }

  const endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const authHeader = { authorization: `Bearer ${options.siteKey}` };

  let compiled = compile(FALLBACK);
  let loadedAt = 0;
  let loading: Promise<void> | null = null;
  let hmacKey: Promise<CryptoKey> | null = null;

  const counters = new Map<string, { start: number; count: number; previous: number }>();
  const queue = new Map<string, QueuedEvent>();
  let lastFlush = Date.now();

  async function loadConfig(): Promise<void> {
    try {
      const response = await fetch(`${endpoint}/api/shield/v1/config`, {
        headers: authHeader,
        signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
        cache: "no-store",
      });
      if (response.status === 401) {
        console.error("Wardova Shield: sitesleutel geweigerd. Controleer WARDOVA_SHIELD_KEY.");
        return;
      }
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (isRemoteConfig(body)) compiled = compile(body);
    } catch {
      // Wardova niet bereikbaar: we draaien door op de laatst bekende configuratie.
    } finally {
      loadedAt = Date.now();
      loading = null;
    }
  }

  async function ensureConfig(): Promise<void> {
    const stale = Date.now() - loadedAt > CONFIG_TTL_MS;
    if (!stale) return;
    loading ??= loadConfig();
    // Alleen de allereerste keer wachten; daarna verversen op de achtergrond.
    // In de Monitor-stand nooit wachten: tot de configuratie er is, geldt FALLBACK (monitor).
    if (loadedAt === 0 && !options.monitorOnly) await loading;
  }

  function sign(message: string): Promise<string> {
    hmacKey ??= crypto.subtle.importKey("raw", encoder.encode(options.siteKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hmacKey.then((key) => crypto.subtle.sign("HMAC", key, encoder.encode(message))).then((signature) => toHex(signature).slice(0, 32));
  }

  function overRateLimit(ip: string, limit: number): boolean {
    const now = Date.now();
    let entry = counters.get(ip);

    if (!entry) {
      if (counters.size >= MAX_TRACKED_IPS) {
        for (const [key, value] of counters) {
          if (now - value.start > WINDOW_MS * 2) counters.delete(key);
        }
        if (counters.size >= MAX_TRACKED_IPS) counters.clear();
      }
      entry = { start: now, count: 0, previous: 0 };
      counters.set(ip, entry);
    }

    const elapsed = now - entry.start;
    if (elapsed >= WINDOW_MS * 2) {
      entry.start = now;
      entry.count = 0;
      entry.previous = 0;
    } else if (elapsed >= WINDOW_MS) {
      entry.previous = entry.count;
      entry.count = 0;
      entry.start += WINDOW_MS;
    }

    entry.count += 1;
    const weight = 1 - Math.min(1, (now - entry.start) / WINDOW_MS);
    return entry.previous * weight + entry.count > limit;
  }

  function record(event: Omit<QueuedEvent, "hits">, context?: ShieldContext): void {
    if (event.ua.toLowerCase().includes(OWN_SCANNER)) return;

    const key = `${event.ip}|${event.action}|${event.reason}`;
    const existing = queue.get(key);
    if (existing) existing.hits += 1;
    else if (queue.size < MAX_QUEUE * 2) queue.set(key, { ...event, hits: 1 });

    if (queue.size >= MAX_QUEUE || Date.now() - lastFlush >= FLUSH_INTERVAL_MS) flush(context);
  }

  function flush(context?: ShieldContext): void {
    if (queue.size === 0) return;
    const events = [...queue.values()];
    queue.clear();
    lastFlush = Date.now();

    const send = fetch(`${endpoint}/api/shield/v1/events`, {
      method: "POST",
      headers: { ...authHeader, "content-type": "application/json" },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(4_000),
      keepalive: true,
    }).then(
      () => undefined,
      () => undefined,
    );

    if (context?.waitUntil) context.waitUntil(send);
  }

  async function hasClearance(cookieHeader: string | null, ip: string): Promise<boolean> {
    const cookie = readCookie(cookieHeader, "wdv_clear");
    if (!cookie) return false;
    const [expiry, signature] = cookie.split(".");
    if (!expiry || !signature || Number(expiry) < Date.now() / 1000) return false;
    return signature === (await sign(`clear|${ip}|${expiry}`));
  }

  async function solvedChallenge(cookieHeader: string | null, ip: string): Promise<boolean> {
    const cookie = readCookie(cookieHeader, "wdv_pow");
    if (!cookie) return false;
    const [expiry, signature, nonce] = cookie.split(".");
    if (!expiry || !signature || !nonce || nonce.length > 20 || Number(expiry) < Date.now() / 1000) return false;
    if (signature !== (await sign(`seed|${ip}|${expiry}`))) return false;
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${expiry}.${signature}.${nonce}`));
    return leadingZeroBits(new Uint8Array(digest)) >= POW_BITS;
  }

  async function challengePage(ip: string): Promise<Response> {
    const expiry = Math.floor(Date.now() / 1000) + SEED_TTL_S;
    const seed = `${expiry}.${await sign(`seed|${ip}|${expiry}`)}`;
    const script = `(async()=>{const s=${JSON.stringify(seed)},e=new TextEncoder();for(let n=0;;n++){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",e.encode(s+"."+n)));let b=0;for(const x of d){if(x===0){b+=8;continue}b+=Math.clz32(x)-24;break}if(b>=${POW_BITS}){document.cookie="wdv_pow="+s+"."+n+"; path=/; max-age=${SEED_TTL_S}; samesite=lax";location.reload();return}}})();`;
    return page(
      "Even controleren…",
      `<h1>Even controleren of je geen bot bent</h1><p>Dit duurt een paar seconden en gaat vanzelf.</p><noscript><p>Zet JavaScript aan om verder te gaan.</p></noscript><script>${script}</script>`,
      403,
    );
  }

  /**
   * Beoordeelt een verzoek. Geeft een Response terug als het verzoek moet worden tegengehouden
   * (of een challenge krijgt), en null als het door mag.
   */
  async function handle(request: Request, context?: ShieldContext): Promise<Response | null> {
    await ensureConfig();
    const config: CompiledConfig = options.monitorOnly ? { ...compiled, mode: "monitor" } : compiled;

    const url = new URL(request.url);
    const path = url.pathname;
    const lowerPath = path.toLowerCase();
    const ua = request.headers.get("user-agent") ?? "";
    const lowerUa = ua.toLowerCase();
    const ip = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim().toLowerCase();
    const country = (request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "").toUpperCase();
    const base = { ip, path: path.slice(0, 300), ua: ua.slice(0, 300), country };

    if (ip && matchesIp(config.allow, ip)) return null;

    let reason: string | null = null;
    if (ip && matchesIp(config.block, ip)) reason = "ip_block";
    else if (country && config.countries.has(country)) reason = "country_block";
    else if (config.paths.some((prefix) => lowerPath.startsWith(prefix))) reason = "path_rule";
    else if (config.blockProbes && PROBE_PATHS.some((probe) => lowerPath.includes(probe))) reason = "probe";
    else if (config.agents.some((agent) => lowerUa.includes(agent))) reason = "ua_rule";
    else if (config.blockBadBots && BAD_AGENTS.some((agent) => lowerUa.includes(agent))) reason = "bad_bot";

    if (reason) {
      if (config.mode === "monitor") {
        record({ ...base, action: "flagged", reason }, context);
        return null;
      }
      record({ ...base, action: "blocked", reason }, context);
      return page("Geblokkeerd", "<h1>Dit verzoek is geblokkeerd</h1><p>Denk je dat dit een vergissing is? Neem contact op met de eigenaar van deze website.</p>", 403);
    }

    const limit = config.mode === "fortress" ? Math.max(10, Math.floor(config.rateLimitPerMinute / 2)) : config.rateLimitPerMinute;
    if (ip && overRateLimit(ip, limit)) {
      if (config.mode === "monitor") {
        record({ ...base, action: "flagged", reason: "rate_limit" }, context);
        return null;
      }
      record({ ...base, action: "rate_limited", reason: "rate_limit" }, context);
      return page("Te veel verzoeken", "<h1>Te veel verzoeken</h1><p>Wacht een minuut en probeer het opnieuw.</p>", 429, { "retry-after": "60" });
    }

    if (config.mode === "fortress") {
      const cookies = request.headers.get("cookie");
      if (await hasClearance(cookies, ip)) return null;

      if (await solvedChallenge(cookies, ip)) {
        const expiry = Math.floor(Date.now() / 1000) + CLEARANCE_TTL_S;
        const clearance = `${expiry}.${await sign(`clear|${ip}|${expiry}`)}`;
        const headers = new Headers({ location: url.pathname + url.search, "cache-control": "no-store" });
        headers.append("set-cookie", `wdv_clear=${clearance}; Path=/; Max-Age=${CLEARANCE_TTL_S}; HttpOnly; Secure; SameSite=Lax`);
        headers.append("set-cookie", "wdv_pow=; Path=/; Max-Age=0; SameSite=Lax");
        return new Response(null, { status: 302, headers });
      }

      record({ ...base, action: "challenged", reason: "fortress" }, context);
      const wantsHtml = (request.method === "GET" || request.method === "HEAD") && (request.headers.get("accept") ?? "").includes("text/html");
      if (wantsHtml) return challengePage(ip);
      return new Response(JSON.stringify({ error: "challenge_required" }), {
        status: 403,
        headers: { "content-type": "application/json", "cache-control": "no-store", "x-wardova-shield": "1" },
      });
    }

    return null;
  }

  return { handle, flush };
}
