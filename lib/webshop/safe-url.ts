import { lookup } from "node:dns/promises";
import net from "node:net";
import { HttpError } from "@/lib/http-error";

/**
 * SSRF-bescherming: een gebruiker vult zelf een winkeladres in (WooCommerce),
 * en onze server doet daar verzoeken naartoe. Zonder controle zou iemand
 * onze server naar interne adressen kunnen sturen (localhost, 10.x, cloud-
 * metadata op 169.254.169.254, ...). Daarom: alleen https, geen IP-adressen,
 * en de hostnaam moet naar uitsluitend publieke IP's wijzen.
 */

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local / cloud-metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast / gereserveerd
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
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
