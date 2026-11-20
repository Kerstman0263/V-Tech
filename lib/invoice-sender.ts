/**
 * Verplichte gegevens van de afzender op een factuur:
 * - bedrijfsnaam, volledig adres en btw-nummer (art. 35a Wet OB). Onder de
 *   kleineondernemersregeling (KOR) staat er geen btw op de factuur en is het
 *   btw-nummer niet nodig.
 * - het KvK-nummer (art. 20 Handelsregisterbesluit 2008). Alleen voor een
 *   bedrijf in Nederland: een buitenlands bedrijf staat niet in het Nederlandse
 *   handelsregister.
 * Puur (geen database), zodat het los te testen is.
 */
export interface SenderDetails {
  name?: string | null;
  /** Versleuteld of leesbaar: alleen of er iets staat telt. */
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  vatNumber?: string | null;
  /** Versleuteld of leesbaar: alleen of er iets staat telt. */
  kvkNumber?: string | null;
  /** Landcode van het bedrijf (standaard NL). */
  country?: string | null;
}

export type MissingSenderField = "name" | "address" | "vatNumber" | "kvkNumber";

const filled = (value: string | null | undefined) => !!value && value.trim().length > 0;

/** Bedrijf in Nederland (ook als er geen land is ingevuld: dat is standaard NL). */
export function isDutchCompany(company: SenderDetails | null | undefined): boolean {
  const country = company?.country?.trim().toUpperCase();
  return !country || country === "NL";
}

export function missingSenderFields(company: SenderDetails | null | undefined, korEnabled: boolean): MissingSenderField[] {
  const missing: MissingSenderField[] = [];
  const dutch = isDutchCompany(company);
  if (!filled(company?.name)) missing.push("name");
  // Een Nederlands adres heeft altijd een postcode; in het buitenland niet overal.
  if (!filled(company?.address) || !filled(company?.city) || (dutch && !filled(company?.postalCode))) missing.push("address");
  if (!korEnabled && !filled(company?.vatNumber)) missing.push("vatNumber");
  if (dutch && !filled(company?.kvkNumber)) missing.push("kvkNumber");
  return missing;
}

const LABELS: Record<MissingSenderField, string> = {
  name: "bedrijfsnaam",
  address: "adres",
  vatNumber: "btw-nummer",
  kvkNumber: "KvK-nummer",
};

/** "Vul eerst je bedrijfsnaam en adres in ..." of null als alles er is. */
export function missingSenderMessage(missing: MissingSenderField[]): string | null {
  if (missing.length === 0) return null;
  const labels = missing.map((field) => LABELS[field]);
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} en ${labels[labels.length - 1]}`;
  return `Vul eerst je ${list} in bij Instellingen > Bedrijfsgegevens. Die moeten wettelijk op een factuur staan.`;
}
