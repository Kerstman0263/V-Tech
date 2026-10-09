/**
 * IBAN-hulpjes en de EPC-QR ("scan en betaal") voor facturen.
 *
 * Gebruikers vullen hun IBAN al in als vrije tekst bij de betaalinstructies
 * ("IBAN NL91 ABNA 0417 1643 00 t.n.v. ..."). We halen daar het eerste
 * geldige IBAN uit (mod-97-controle), zodat er geen aparte instelling nodig is.
 */

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** Eerste geldige IBAN in een vrije tekst (met of zonder spaties), of null. */
export function extractIban(text: string | null | undefined): string | null {
  if (!text) return null;
  const candidates = text.toUpperCase().match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g) ?? [];
  for (const c of candidates) {
    if (isValidIban(c)) return normalizeIban(c);
  }
  return null;
}

/** IBAN leesbaar in groepjes van vier. */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

/**
 * EPC069-12 (versie 002) payload: de Europese "SEPA-QR" die bank-apps
 * kunnen scannen. Alleen voor positieve eurobedragen; anders null.
 */
export function epcQrPayload(input: { name: string; iban: string; amount: number; currency: string; reference: string }): string | null {
  const iban = normalizeIban(input.iban);
  if (input.currency !== "EUR" || !isValidIban(iban)) return null;
  if (!Number.isFinite(input.amount) || input.amount < 0.01 || input.amount > 999_999_999.99) return null;
  const clean = (s: string, max: number) => s.replace(/[\r\n]+/g, " ").trim().slice(0, max);
  const name = clean(input.name, 70);
  if (!name) return null;
  return [
    "BCD", // vaste kop
    "002", // versie
    "1", // UTF-8
    "SCT", // SEPA Credit Transfer
    "", // BIC (optioneel binnen de EER sinds versie 002)
    name,
    iban,
    `EUR${input.amount.toFixed(2)}`,
    "", // doel
    "", // gestructureerde referentie
    clean(input.reference, 140), // omschrijving voor de klant
  ].join("\n");
}
