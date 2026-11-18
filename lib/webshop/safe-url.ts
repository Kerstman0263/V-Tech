import { lookup } from "node:dns/promises";
import net from "node:net";
import { HttpError } from "@/lib/http-error";

/**
 * SSRF-bescherming: een gebruiker vult zelf een winkeladres in (WooCommerce),
 * en onze server doet daar verzoeken naartoe. Zonder controle zou iemand
 * onze server naar interne adressen kunnen sturen (localhost, 10.x, cloud-
 * metadata op 169.254.169.254, ...). Daarom: alleen https, geen IP-adressen,
 * en de hostnaam moet naar uitsluitend publieke IP's wijzen.
 *
 * Nog open: de controle (assertPublicHost) en het echte verzoek (fetch) doen
 * elk een eigen DNS-opvraging. Een kwaadwillende DNS-server kan daartussen
 * een ander antwoord geven ("DNS-rebinding"). Dichttimmeren kan door de
 * verbinding te maken met het al gecontroleerde IP (bijv. een undici-Agent
 * met eigen lookup); undici staat nu niet als dependency in package.json.
 */

/** IPv4 als vier getallen, of null als het geen geldig IPv4-adres is. */
function ipv4Parts(ip: string): number[] | null {
  if (!net.isIPv4(ip)) return null;
  return ip.split(".").map(Number);
}

function isPrivateIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // "dit netwerk"
    a === 10 || // privé
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud-metadata
    (a === 172 && b >= 16 && b <= 31) || // privé
    (a === 192 && b === 168) || // privé
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24 IETF-protocollen
    (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 documentatie (TEST-NET-1)
    (a === 192 && b === 88 && c === 99) || // 192.88.99.0/24 oude 6to4-relay
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarktests
    (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 documentatie (TEST-NET-2)
    (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24 documentatie (TEST-NET-3)
    a >= 224 // multicast / gereserveerd / broadcast
  );
}

/** IPv6 als acht 16-bits groepen (ook met :: en een IPv4-staart), of null. */
function ipv6Groups(ip: string): number[] | null {
  let v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = v.indexOf("%");
  if (zone >= 0) v = v.slice(0, zone); // fe80::1%eth0
  if (!net.isIPv6(v)) return null;
  // IPv4-staart (::ffff:1.2.3.4) omzetten naar twee groepen.
  const tail = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const p = ipv4Parts(tail[1]);
    if (!p) return null;
    v = v.slice(0, -tail[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const [head, rest] = v.split("::");
  const left = head ? head.split(":") : [];
  const right = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const missing = 8 - left.length - right.length;
  const groups = rest !== undefined ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8) return null;
  return groups.map((g) => parseInt(g, 16));
}

function isPrivateIpv6(g: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g;
  const embeddedV4 = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (firstFiveZero && g5 === 0) return true; // ::, ::1 en het oude ::a.b.c.d (::/96)
  if (firstFiveZero && g5 === 0xffff) return isPrivateIpv4(embeddedV4); // ::ffff:a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return true; // 64:ff9b::/96 NAT64
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return true; // 64:ff9b:1::/48 lokale NAT64
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // 100::/64 weggooi-bereik
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // 2001:db8::/32 documentatie
  if (g0 === 0x2001 && g1 === 0) return true; // 2001::/32 Teredo-tunnel
  if (g0 === 0x2002) return true; // 2002::/16 6to4-tunnel (verpakt een IPv4-adres)
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 privé (ULA)
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 oud site-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** True als het adres niet publiek is (of niet te lezen): dan maken we geen verbinding. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4Parts(ip.trim());
  if (v4) return isPrivateIpv4(v4);
  const v6 = ipv6Groups(ip.trim());
  if (v6) return isPrivateIpv6(v6);
  return true; // onbekend formaat: liever niet
}

/** Normaliseert en controleert een winkel-URL. Gooit HttpError(422) bij iets verdachts. */
export function normalizeShopUrl(raw: string): URL {
  let value = raw.trim();
  if (!/^[a-z]+:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(422, "Dit winkeladres klopt niet. Gebruik bijvoorbeeld https://mijnwinkel.nl");
  }
  if (url.protocol !== "https:") throw new HttpError(422, "Gebruik een https-adres voor je winkel.");
  if (url.username || url.password) throw new HttpError(422, "Zet geen inloggegevens in het winkeladres.");
  if (url.port && url.port !== "443") throw new HttpError(422, "Gebruik het gewone https-adres van je winkel (zonder poortnummer).");
  const host = url.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") {
    throw new HttpError(422, "Gebruik de domeinnaam van je winkel, bijvoorbeeld mijnwinkel.nl.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

/** Controleert dat de hostnaam alleen naar publieke IP's wijst (vlak vóór het verzoek). */
export async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpError(422, "Dit winkeladres kunnen we niet vinden. Controleer de spelling.");
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
    throw new HttpError(422, "Dit winkeladres is niet publiek bereikbaar.");
  }
}

/** Shopify-winkeldomein: alleen <naam>.myshopify.com (geen eigen domein, geen pad). */
export function normalizeShopifyDomain(raw: string): string {
  const v = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const withSuffix = v.endsWith(".myshopify.com") ? v : `${v}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(withSuffix)) {
    throw new HttpError(422, "Vul je Shopify-adres in als mijnwinkel.myshopify.com");
  }
  return withSuffix;
}

/**
 * fetch met harde grenzen: time-out, geen redirects (anders kan een publieke
 * host alsnog naar een intern adres doorsturen) en een maximale omvang.
 */
export async function guardedFetch(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, redirect: "manual", signal: controller.signal, cache: "no-store" });
    if (res.status >= 300 && res.status < 400) {
      throw new HttpError(422, "De winkel stuurt ons door naar een ander adres. Gebruik het exacte adres van je winkel.");
    }
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > 15_000_000) throw new HttpError(502, "De winkel stuurde een te groot antwoord terug.");
    return res;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if ((err as Error)?.name === "AbortError") throw new HttpError(504, "De winkel reageerde niet op tijd. Probeer het zo nog eens.");
    throw new HttpError(502, "We konden je winkel niet bereiken. Controleer het adres en probeer opnieuw.");
  } finally {
    clearTimeout(timer);
  }
}
