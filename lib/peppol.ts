import { normalizeVatId, vatIdCountry } from "@/lib/vat-scheme";

/**
 * Peppol-adres (elektronisch adres, EndpointID) en identificatie voor de
 * e-factuur. Puur (geen database), zodat de regels los te testen zijn.
 *
 * Een Peppol-adres schrijven we als "schema:nummer", bijvoorbeeld
 * "0106:12345678" (KvK-nummer). Het schema komt uit de Peppol-codelijst
 * "Electronic Address Scheme" (EAS). We laten alleen schema's toe waarvan we
 * zeker weten dat ze in die lijst staan.
 */

export const PEPPOL_ADDRESS_SCHEMES = {
  /** KvK-nummer (8 cijfers). */
  "0106": "kvk",
  /** OIN van een Nederlandse overheidsorganisatie (20 cijfers). */
  "0190": "oin",
  /** GLN (13 cijfers met GS1-controlecijfer). */
  "0088": "gln",
  /** Belgisch ondernemingsnummer (10 cijfers, controle modulo 97). */
  "0208": "kbo",
  /** Duitse Leitweg-ID (overheid). */
  "0204": "leitweg",
  /** Nederlands btw-nummer. */
  "9944": "vat",
  /** Belgisch btw-nummer. */
  "9925": "vat",
  /** Duits btw-nummer. */
  "9930": "vat",
} as const;

export type PeppolScheme = keyof typeof PEPPOL_ADDRESS_SCHEMES;

/**
 * Peppol-schema voor een btw-nummer, per land van het btw-nummer. Alleen de
 * landen waarvan het schema zeker in de Peppol-codelijst staat. Andere landen:
 * geen btw-schema (dan het Peppol-adres van de klant of het e-mailadres).
 */
export const VAT_ENDPOINT_SCHEMES: Record<string, string> = {
  AT: "9914",
  BE: "9925",
  DE: "9930",
  ES: "9920",
  FR: "9957",
  NL: "9944",
};

export interface PeppolId {
  scheme: string;
  id: string;
}

const isScheme = (value: string): value is PeppolScheme => Object.prototype.hasOwnProperty.call(PEPPOL_ADDRESS_SCHEMES, value);

/** GS1-controlecijfer (GLN, 13 cijfers). */
export function isValidGln(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Belgisch ondernemingsnummer: 10 cijfers, begint met 0 of 1, controle modulo 97. */
export function isValidBelgianEnterpriseNumber(value: string): boolean {
  if (!/^[01]\d{9}$/.test(value)) return false;
  return 97 - (Number(value.slice(0, 8)) % 97) === Number(value.slice(8));
}

/** Klopt dit nummer bij dit schema? */
function validIdFor(scheme: PeppolScheme, id: string): boolean {
  switch (PEPPOL_ADDRESS_SCHEMES[scheme]) {
    case "kvk": return /^\d{8}$/.test(id);
    case "oin": return /^\d{20}$/.test(id);
    case "gln": return isValidGln(id);
    case "kbo": return isValidBelgianEnterpriseNumber(id);
    case "leitweg": return /^[0-9A-Za-z][0-9A-Za-z-]{1,45}$/.test(id);
    case "vat": {
      const country = vatIdCountry(id);
      return !!country && VAT_ENDPOINT_SCHEMES[country] === scheme;
    }
  }
}

/** Peppol-adres zoals het wordt opgeslagen: "0106:12345678", zonder spaties. */
export function normalizePeppolId(value: string | null | undefined): string {
  const raw = (value ?? "").replace(/\s+/g, "");
  const at = raw.indexOf(":");
  if (at < 0) return raw;
  const scheme = raw.slice(0, at);
  let id = raw.slice(at + 1);
  if (isScheme(scheme) && PEPPOL_ADDRESS_SCHEMES[scheme] === "vat") id = normalizeVatId(id);
  if (isScheme(scheme) && PEPPOL_ADDRESS_SCHEMES[scheme] === "kbo") id = id.replace(/\./g, "");
  return `${scheme}:${id}`;
}

/** "0106:12345678" -> { scheme, id }, of null als het geen geldig Peppol-adres is. */
export function parsePeppolId(value: string | null | undefined): PeppolId | null {
  const normalized = normalizePeppolId(value);
  const at = normalized.indexOf(":");
  if (at < 0) return null;
  const scheme = normalized.slice(0, at);
  const id = normalized.slice(at + 1);
  if (!isScheme(scheme) || !id || !validIdFor(scheme, id)) return null;
  return { scheme, id };
}

/** Een geldig btw-nummer met landcode (BR-CO-09), of null. */
export function validVatId(value: string | null | undefined): string | null {
  const id = normalizeVatId(value);
  return vatIdCountry(id) ? id : null;
}

const validEmail = (value: string | null | undefined) => {
  const v = (value ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
};

/**
 * Elektronisch adres (EndpointID, verplicht in Peppol: PEPPOL-EN16931-R010 en
 * R020). Volgorde: het opgegeven Peppol-adres, het KvK-nummer, het btw-nummer
 * (alleen landen met een bekend schema), en anders het e-mailadres (schema EM).
 * Null als er niets bruikbaars is.
 */
export function endpointFor(party: {
  electronicAddress?: string | null;
  kvkNumber?: string | null;
  vatNumber?: string | null;
  email?: string | null;
}): PeppolId | null {
  const explicit = parsePeppolId(party.electronicAddress);
  if (explicit) return explicit;
  const kvk = (party.kvkNumber ?? "").replace(/\s+/g, "");
  if (/^\d{8}$/.test(kvk)) return { scheme: "0106", id: kvk };
  const vat = validVatId(party.vatNumber);
  const vatScheme = vat ? VAT_ENDPOINT_SCHEMES[vatIdCountry(vat)!] : undefined;
  if (vat && vatScheme) return { scheme: vatScheme, id: vat };
  const email = validEmail(party.email);
  if (email) return { scheme: "EM", id: email };
  return null;
}
