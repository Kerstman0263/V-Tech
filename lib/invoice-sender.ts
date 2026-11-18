/**
 * Verplichte gegevens van de afzender op een factuur (art. 35a Wet OB):
 * bedrijfsnaam, adres en btw-nummer. Onder de kleineondernemersregeling (KOR)
 * staat er geen btw op de factuur en is het btw-nummer niet nodig.
 * Puur (geen database), zodat het los te testen is.
 */
export interface SenderDetails {
  name?: string | null;
  /** Versleuteld of leesbaar: alleen of er iets staat telt. */
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  vatNumber?: string | null;
}

export type MissingSenderField = "name" | "address" | "vatNumber";

const filled = (value: string | null | undefined) => !!value && value.trim().length > 0;

export function missingSenderFields(company: SenderDetails | null | undefined, korEnabled: boolean): MissingSenderField[] {
  const missing: MissingSenderField[] = [];
  if (!filled(company?.name)) missing.push("name");
  if (!filled(company?.address) || !filled(company?.city)) missing.push("address");
  if (!korEnabled && !filled(company?.vatNumber)) missing.push("vatNumber");
  return missing;
}

const LABELS: Record<MissingSenderField, string> = {
  name: "bedrijfsnaam",
  address: "adres",
  vatNumber: "btw-nummer",
};

/** "Vul eerst je bedrijfsnaam en adres in ..." of null als alles er is. */
export function missingSenderMessage(missing: MissingSenderField[]): string | null {
  if (missing.length === 0) return null;
  const labels = missing.map((field) => LABELS[field]);
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} en ${labels[labels.length - 1]}`;
  return `Vul eerst je ${list} in bij Instellingen > Bedrijfsgegevens. Die moeten wettelijk op een factuur staan.`;
}
