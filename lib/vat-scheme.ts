/**
 * Btw-soort van een factuur. Puur (geen database), zodat de regels los te testen zijn.
 *
 * - STANDARD: gewone Nederlandse btw (0, 9 of 21% per regel).
 * - REVERSE_NL: btw verlegd binnen Nederland (verleggingsregeling, bijv.
 *   onderaanneming). De afnemer draagt de btw af. Op de factuur: "btw verlegd"
 *   en het btw-nummer van de afnemer (art. 35a lid 1 Wet OB).
 * - REVERSE_EU: dienst aan een bedrijf in een ander EU-land. De dienst is belast
 *   in het land van de afnemer en de btw is verlegd (art. 44 en 196
 *   Btw-richtlijn). Op de factuur: "btw verlegd" en beide btw-nummers.
 * - ICL: intracommunautaire levering van goederen aan een bedrijf in een ander
 *   EU-land: 0% (art. 138 Btw-richtlijn). Op de factuur: de vermelding en beide
 *   btw-nummers.
 *
 * In de database staat de standaard als lege waarde (null), zodat oude facturen
 * en klanten zonder deze kolom gewoon "gewone btw" zijn.
 */
export const VAT_SCHEMES = ["STANDARD", "REVERSE_NL", "REVERSE_EU", "ICL"] as const;
export type VatScheme = (typeof VAT_SCHEMES)[number];

/** Lidstaten van de EU (ISO 3166-1 alpha-2). Griekenland gebruikt in btw-nummers "EL". */
export const EU_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
] as const;

export function isVatScheme(value: unknown): value is VatScheme {
  return typeof value === "string" && (VAT_SCHEMES as readonly string[]).includes(value);
}

/** Waarde uit de database of een formulier; alles wat onbekend of leeg is = gewone btw. */
export function parseVatScheme(value: unknown): VatScheme {
  return isVatScheme(value) ? value : "STANDARD";
}

/** Zo gaat de btw-soort de database in: gewone btw als leeg. */
export function storedVatScheme(scheme: VatScheme): string | null {
  return scheme === "STANDARD" ? null : scheme;
}

/** Btw verlegd (binnenland of EU-dienst). */
export function isReverseCharge(scheme: VatScheme): boolean {
  return scheme === "REVERSE_NL" || scheme === "REVERSE_EU";
}

/** Btw-nummer zonder spaties, punten of streepjes, in hoofdletters. */
export function normalizeVatId(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s.\-]/g, "").toUpperCase();
}

/** Landcode van een btw-nummer (EL wordt GR), of null als het geen landcode heeft. */
export function vatIdCountry(value: string | null | undefined): string | null {
  const id = normalizeVatId(value);
  if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(id)) return null;
  const prefix = id.slice(0, 2);
  return prefix === "EL" ? "GR" : prefix;
}

function countryCode(value: string | null | undefined): string {
  const c = (value ?? "").trim().toUpperCase();
  return c || "NL";
}

const isOtherEuCountry = (c: string | null) => !!c && c !== "NL" && (EU_COUNTRIES as readonly string[]).includes(c);

export interface VatSchemeCheck {
  scheme: VatScheme;
  /** Btw-tarief van elke regel. */
  lineRates: number[];
  customer: { country?: string | null; vatNumber?: string | null };
  /** Alleen of er een btw-nummer staat telt (in de database versleuteld). */
  seller: { vatNumber?: string | null };
  korEnabled: boolean;
  /** Creditfactuur: volgt de btw-soort van het origineel, ook als de KOR inmiddels aan staat. */
  isCredit?: boolean;
}

export type VatSchemeProblemCode =
  | "rates_not_zero"
  | "buyer_vat_missing"
  | "buyer_vat_invalid"
  | "buyer_not_dutch"
  | "buyer_not_eu"
  | "seller_vat_missing"
  | "kor_conflict";

const MESSAGES: Record<VatSchemeProblemCode, string> = {
  rates_not_zero: "Bij btw verlegd of een intracommunautaire levering reken je zelf geen btw. Zet alle regels op 0%.",
  buyer_vat_missing: "Vul eerst het btw-nummer van de klant in bij Klanten. Bij btw verlegd of een intracommunautaire levering moet dat op de factuur staan.",
  buyer_vat_invalid: "Het btw-nummer van de klant moet met de landcode beginnen, bijvoorbeeld NL123456789B01 of BE0123456789.",
  buyer_not_dutch: "Btw verlegd binnen Nederland kan alleen bij een klant in Nederland met een Nederlands btw-nummer.",
  buyer_not_eu: "Een dienst of levering aan een EU-bedrijf kan alleen bij een klant in een ander EU-land, met een btw-nummer uit een ander EU-land dan Nederland.",
  seller_vat_missing: "Vul eerst je eigen btw-nummer in bij Instellingen > Bedrijfsgegevens. Bij btw verlegd of een intracommunautaire levering moet dat op de factuur staan.",
  kor_conflict: "Met de kleineondernemersregeling (KOR) aan maakt Saldova geen factuur met btw verlegd binnen Nederland of een intracommunautaire levering. Overleg met je boekhouder welke regel voor jou geldt.",
};

/** Eerste reden waarom deze btw-soort hier niet kan, of null als het klopt. */
export function vatSchemeProblemCode(input: VatSchemeCheck): VatSchemeProblemCode | null {
  const { scheme } = input;
  if (scheme === "STANDARD") return null;
  // Veilige kant: bij de KOR is het onzeker of verleggen binnen Nederland of een
  // ICL kan; dat laten we niet toe. Een dienst aan een EU-bedrijf valt buiten de
  // Nederlandse KOR (belast in het land van de afnemer).
  if (input.korEnabled && !input.isCredit && (scheme === "REVERSE_NL" || scheme === "ICL")) return "kor_conflict";
  if (input.lineRates.some((rate) => Number(rate) !== 0)) return "rates_not_zero";
  if (!normalizeVatId(input.seller.vatNumber)) return "seller_vat_missing";
  const buyerVat = normalizeVatId(input.customer.vatNumber);
  if (!buyerVat) return "buyer_vat_missing";
  const prefix = vatIdCountry(buyerVat);
  if (!prefix) return "buyer_vat_invalid";
  const country = countryCode(input.customer.country);
  if (scheme === "REVERSE_NL") {
    if (country !== "NL" || prefix !== "NL") return "buyer_not_dutch";
    return null;
  }
  if (!isOtherEuCountry(country) || !isOtherEuCountry(prefix)) return "buyer_not_eu";
  return null;
}

export function vatSchemeProblem(input: VatSchemeCheck): string | null {
  const code = vatSchemeProblemCode(input);
  return code ? MESSAGES[code] : null;
}

/**
 * Waarom deze klant (nog) geen standaard btw-soort kan hebben, of null.
 * Met de KOR aan kan een klant geen standaard "btw verlegd binnen Nederland"
 * of "intracommunautaire levering" krijgen: elke automatische factuur aan die
 * klant (periodiek, aanbetaling) zou dan geweigerd worden.
 */
export function customerVatSchemeProblem(
  customer: { vatScheme: VatScheme; country?: string | null; vatNumber?: string | null },
  options: { korEnabled?: boolean } = {},
): string | null {
  if (customer.vatScheme === "STANDARD") return null;
  const code = vatSchemeProblemCode({
    scheme: customer.vatScheme, lineRates: [], customer, seller: { vatNumber: "x" }, korEnabled: !!options.korEnabled,
  });
  return code ? MESSAGES[code] : null;
}

/**
 * De standaard btw-soort van een klant zoals die nu bruikbaar is. Met de KOR
 * aan vallen "btw verlegd binnen Nederland" en "intracommunautaire levering"
 * terug op gewone btw (een KOR-factuur met 0%); die kunnen onder de KOR niet.
 */
export function effectiveCustomerVatScheme(customerScheme: unknown, korEnabled = false): VatScheme {
  const scheme = parseVatScheme(customerScheme);
  if (korEnabled && (scheme === "REVERSE_NL" || scheme === "ICL")) return "STANDARD";
  return scheme;
}

/**
 * Btw-soort voor een factuur die niet uit het factuurformulier komt (periodiek,
 * offerte, aanbetaling): de standaard van de klant, maar alleen als alle regels
 * op 0% staan. Anders gewone btw: het bedrag dat de klant al zag verandert nooit stil.
 * Met de KOR aan geldt effectiveCustomerVatScheme.
 */
export function implicitVatScheme(customerScheme: unknown, lineRates: number[], korEnabled = false): VatScheme {
  const scheme = effectiveCustomerVatScheme(customerScheme, korEnabled);
  if (scheme === "STANDARD") return scheme;
  return lineRates.every((rate) => Number(rate) === 0) ? scheme : "STANDARD";
}
