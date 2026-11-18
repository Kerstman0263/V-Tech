/**
 * Bedrijfsgegevens van Saldova zelf: de enige plek waar ze staan.
 *
 * De site, de footer, /contact en de juridische documenten (lib/legal/content.ts) lezen
 * alles hieruit. Niets is verzonnen: wat nog niet bekend is, staat op null en wordt op de site
 * als nette, eerlijke regel getoond ("KvK-nummer volgt na inschrijving bij de KvK").
 *
 * EIGENAAR: vul hieronder de gegevens in zodra de inschrijving bij de KvK rond is.
 *  - Elk veld dat je invult, verschijnt vanzelf op de site en in de juridische documenten.
 *  - Zijn KvK-nummer, btw-id, vestigingsadres en e-mailadres ingevuld EN staat online betalen
 *    aan (MOLLIE_API_KEY gezet), dan geldt Saldova als gelanceerd: het label "nog niet
 *    gelanceerd" verdwijnt overal en abonnementen zijn online te koop.
 *  - Verandert hierdoor de tekst van de juridische documenten, hoog dan DOC_VERSIONS op in
 *    app/api/register/route.ts.
 *
 * In lib/ova.ts staan alleen de Ova-producten en bundels, geen gegevens van een Ova-groepsentiteit.
 *
 * Dit bestand is puur (geen database, geen Next): het mag ook in tests worden gebruikt. Roep
 * isLaunched() alleen op de server aan; clientcomponenten krijgen de uitkomst via
 * components/company/LaunchStatus.tsx, omdat MOLLIE_API_KEY daar niet bestaat.
 */

import { HttpError } from "@/lib/http-error";

export type LegalForm = "eenmanszaak" | "vof" | "bv";

export type CompanyAddress = {
  street: string; // straat en huisnummer
  postalCode: string;
  city: string;
  country: string; // bv. "Nederland"
};

export type CompanyInfo = {
  /** Handelsnaam, zoals ingeschreven bij de KvK. */
  tradeName: string;
  legalForm: LegalForm | null;
  /** Naam van de eigenaar (bij een eenmanszaak is dat de contractpartij). */
  ownerName: string | null;
  /** Vestigingsadres. Een postbus mag niet. */
  address: CompanyAddress | null;
  /** KvK-nummer: 8 cijfers. */
  kvkNumber: string | null;
  /** Btw-identificatienummer (NL…B..), niet het omzetbelastingnummer. */
  vatId: string | null;
  /** Algemeen e-mailadres. */
  email: string | null;
  /** E-mailadres voor privacyvragen (AVG). Leeg = het algemene e-mailadres. */
  privacyEmail: string | null;
};

// EIGENAAR: hier invullen. Laat een veld op null tot het echt bekend is.
export const COMPANY: CompanyInfo = {
  tradeName: "Saldova",
  legalForm: null, // bv. "eenmanszaak"
  ownerName: null, // bv. "Voornaam Achternaam"
  address: null, // bv. { street: "Straat 1", postalCode: "1234 AB", city: "Plaats", country: "Nederland" }
  kvkNumber: null, // bv. "12345678"
  vatId: null, // bv. "NL000000000B01"
  email: null, // bv. "hallo@saldova.nl"
  privacyEmail: null, // bv. "privacy@saldova.nl"
};

/** Gegevens die ingevuld moeten zijn voor de lancering (art. 3:15d BW, art. 13 AVG). */
export const REQUIRED_COMPANY_FIELDS = ["kvkNumber", "vatId", "address", "email"] as const;
export type RequiredCompanyField = (typeof REQUIRED_COMPANY_FIELDS)[number];

function filled(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function addressFilled(address: CompanyAddress | null): boolean {
  return !!address && filled(address.street) && filled(address.postalCode) && filled(address.city);
}

function fieldFilled(info: CompanyInfo, field: RequiredCompanyField): boolean {
  return field === "address" ? addressFilled(info.address) : filled(info[field]);
}

/** Welke verplichte gegevens nog ontbreken, in vaste volgorde. Leeg = alles is ingevuld. */
export function missingCompanyFields(info: CompanyInfo = COMPANY): RequiredCompanyField[] {
  return REQUIRED_COMPANY_FIELDS.filter((field) => !fieldFilled(info, field));
}

export function companyDetailsComplete(info: CompanyInfo = COMPANY): boolean {
  return missingCompanyFields(info).length === 0;
}

/** Ingeschreven bij de KvK? Zolang dat niet zo is, staat er "in oprichting". */
export function isRegistered(info: CompanyInfo = COMPANY): boolean {
  return filled(info.kvkNumber);
}

/**
 * Welke "volgt nog"-tekst (messages: companyInfo.*) bij een ontbrekend gegeven hoort. Vóór de
 * inschrijving: "Volgt na inschrijving bij de KvK". Is het KvK-nummer er al, dan klopt dat niet
 * meer voor btw-id en adres; dan staat er "Volgt na toekenning door de Belastingdienst" (btw-id)
 * of "Volgt binnenkort" (adres). `compact` kiest de korte footer-variant.
 */
export function pendingMessageKey(
  field: RequiredCompanyField | "registration",
  info: CompanyInfo = COMPANY,
  compact = false,
): string {
  const base = compact ? "pendingCompact" : "pending";
  const afterRegistration = isRegistered(info) && (field === "vatId" || field === "address");
  return `${base}${afterRegistration ? "Registered" : ""}.${field}`;
}

/** E-mailadres voor privacyvragen: het privacyadres, anders het algemene. */
export function privacyContactEmail(info: CompanyInfo = COMPANY): string | null {
  return filled(info.privacyEmail) ? info.privacyEmail : filled(info.email) ? info.email : null;
}

type Env = Record<string, string | undefined>;

/**
 * Staat online betalen aan? Zelfde regel als mollie() in lib/mollie.ts: zonder MOLLIE_API_KEY
 * weigert de checkout met een 503.
 */
export function onlinePaymentsConfigured(env: Env = process.env): boolean {
  return filled(env.MOLLIE_API_KEY);
}

/** Mogen abonnementen online verkocht worden? Pas als de verplichte bedrijfsgegevens er zijn. */
export function subscriptionSalesAllowed(info: CompanyInfo = COMPANY): boolean {
  return companyDetailsComplete(info);
}

/** Gelanceerd = verplichte bedrijfsgegevens ingevuld én online betalen staat aan. Alleen op de server. */
export function isLaunched(info: CompanyInfo = COMPANY, env: Env = process.env): boolean {
  return companyDetailsComplete(info) && onlinePaymentsConfigured(env);
}

/** Melding als online betalen (nog) niet kan. Dezelfde tekst als bij een ontbrekende Mollie-sleutel. */
export const ONLINE_PAYMENTS_UNAVAILABLE = "Online betalen is nog niet ingesteld. Probeer het later opnieuw.";

/**
 * Voor de checkout: weigert met 503 (zelfde status en melding als zonder MOLLIE_API_KEY) zolang
 * de verplichte bedrijfsgegevens ontbreken. De app toont bij een 503 een rustige melding.
 */
export function assertSubscriptionSalesAllowed(info: CompanyInfo = COMPANY): void {
  if (!subscriptionSalesAllowed(info)) throw new HttpError(503, ONLINE_PAYMENTS_UNAVAILABLE);
}

/** Adres op één regel: "Straat 1, 1234 AB Plaats" (land alleen als het niet Nederland is). */
export function formatAddress(address: CompanyAddress): string {
  const place = [address.postalCode.trim(), address.city.trim()].filter(Boolean).join(" ");
  const country = address.country?.trim();
  const showCountry = !!country && country.toLowerCase() !== "nederland" && country.toLowerCase() !== "the netherlands";
  return [address.street.trim(), place, showCountry ? country : ""].filter(Boolean).join(", ");
}

/**
 * Welke "volgt nog"-regels de compacte weergave (footer) toont. Ontbreken KvK-nummer, btw-id en
 * adres alle drie, dan is dat één regel ("registration"); anders één regel per ontbrekend veld.
 */
export function compactPendingNotes(info: CompanyInfo = COMPANY): Array<"registration" | RequiredCompanyField> {
  const missing = missingCompanyFields(info);
  const registration: RequiredCompanyField[] = ["kvkNumber", "vatId", "address"];
  const notes: Array<"registration" | RequiredCompanyField> = registration.every((f) => missing.includes(f))
    ? ["registration"]
    : missing.filter((f) => registration.includes(f));
  if (missing.includes("email")) notes.push("email");
  return notes;
}
