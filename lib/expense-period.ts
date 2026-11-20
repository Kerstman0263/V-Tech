/**
 * Uitgaven in een btw-tijdvak dat al is aangegeven.
 *
 * Saldova werkt met de btw-aangifte per kwartaal. Die moet uiterlijk de laatste
 * dag van de maand na het kwartaal binnen zijn (31 januari, 30 april, 31 juli,
 * 31 oktober; zie ook lib/today-actions.ts). Is die datum voorbij, dan is de
 * voorbelasting van dat kwartaal afgetrokken en is het tijdvak dicht:
 * - een uitgave uit dat kwartaal kan niet meer worden verwijderd (het bonnetje
 *   is het bewijs voor de aftrek; bewaarplicht 7 jaar);
 * - bedrag, btw-tarief, datum, leverancier en bonnetje veranderen niet meer;
 *   omschrijving en categorie wel, en een ontbrekend bonnetje mag erbij;
 * - een uitgave kan ook niet naar een dicht kwartaal worden verplaatst.
 * Een fout in een dicht tijdvak corrigeer je in een volgende aangifte of met een
 * suppletie, niet door de boeking weg te halen.
 *
 * Veilige kant: Saldova weet niet wanneer je echt hebt aangegeven. Tot de
 * uiterste aangiftedatum kun je nog corrigeren; daarna niet meer.
 * Puur (geen database), zodat het los te testen is.
 */

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Kwartaal van een datum en de uiterste aangiftedatum daarvan. */
export function vatQuarterOf(date: Date): { year: number; quarter: number; due: Date } {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  // Laatste dag van de maand na het kwartaal: dag 0 van de tweede maand erna.
  const due = new Date(Date.UTC(year, quarter * 3 + 1, 0));
  return { year, quarter, due };
}

/** Is de aangiftetermijn van het kwartaal van deze datum voorbij? */
export function isVatPeriodClosed(date: Date, now: Date = new Date()): boolean {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  return utcDay(now) > utcDay(vatQuarterOf(date).due);
}

export interface ExpenseLockFields {
  date: Date;
  vendor: string;
  amountGross: number;
  vatRate: number;
  receipt: string | null;
}

export interface ExpensePatch {
  date?: Date;
  vendor?: string;
  amountGross?: number;
  vatRate?: number;
  /** undefined = niet meegestuurd; null = bonnetje weghalen. */
  receipt?: string | null;
}

export interface ExpenseLockBlock {
  code: "vat_period_closed";
  message: string;
  quarter: number;
  year: number;
}

function blockFor(date: Date, what: "delete" | "edit" | "move"): ExpenseLockBlock {
  const { quarter, year } = vatQuarterOf(date);
  const period = `kwartaal ${quarter} van ${year}`;
  const message = what === "delete"
    ? `Deze uitgave hoort bij ${period}. De btw-aangifte daarvan is al gedaan, dus verwijderen kan niet meer: het bonnetje is het bewijs voor de afgetrokken btw en moet 7 jaar bewaard blijven. Klopt de uitgave niet? Verwerk de correctie in een volgende btw-aangifte of met een suppletie (vraag zo nodig je boekhouder).`
    : what === "move"
      ? `De btw-aangifte van ${period} is al gedaan. Een uitgave kan niet meer naar dat kwartaal worden verplaatst.`
      : `Deze uitgave hoort bij ${period}. De btw-aangifte daarvan is al gedaan, dus bedrag, btw, datum, leverancier en bonnetje veranderen niet meer. Omschrijving en categorie kun je wel aanpassen. Klopt er iets niet? Verwerk de correctie in een volgende btw-aangifte of met een suppletie.`;
  return { code: "vat_period_closed", message, quarter, year };
}

/** Mag deze uitgave weg? null = ja. */
export function expenseDeleteBlock(expense: Pick<ExpenseLockFields, "date">, now: Date = new Date()): ExpenseLockBlock | null {
  return isVatPeriodClosed(expense.date, now) ? blockFor(expense.date, "delete") : null;
}

const sameMoney = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

/** Mag deze wijziging? null = ja. */
export function expenseEditBlock(existing: ExpenseLockFields, patch: ExpensePatch, now: Date = new Date()): ExpenseLockBlock | null {
  const dateChanged = patch.date !== undefined && utcDay(patch.date) !== utcDay(existing.date);
  if (isVatPeriodClosed(existing.date, now)) {
    const changed =
      dateChanged ||
      (patch.vendor !== undefined && patch.vendor.trim() !== existing.vendor.trim()) ||
      (patch.amountGross !== undefined && !sameMoney(patch.amountGross, existing.amountGross)) ||
      (patch.vatRate !== undefined && !sameMoney(patch.vatRate, existing.vatRate)) ||
      // Een ontbrekend bonnetje toevoegen mag; een bestaand vervangen of weghalen niet.
      (patch.receipt !== undefined && !!existing.receipt && patch.receipt !== existing.receipt);
    return changed ? blockFor(existing.date, "edit") : null;
  }
  if (dateChanged && isVatPeriodClosed(patch.date!, now)) return blockFor(patch.date!, "move");
  return null;
}

/**
 * Logregel bij het verwijderen: genoeg om de boeking terug te vinden en te
 * verantwoorden (datum, leverancier, bedrag, btw), plus het id.
 */
export function expenseLogTarget(expense: {
  id: string;
  date: Date;
  vendor: string;
  amountGross: number | string | { toString(): string };
  vatAmount: number | string | { toString(): string };
  vatRate: number | string | { toString(): string };
  receipt?: string | null;
}): string {
  const euro = (n: number | string | { toString(): string }) => `€ ${Number(n).toFixed(2).replace(".", ",")}`;
  const day = expense.date.toISOString().slice(0, 10);
  const receipt = expense.receipt ? "met bonnetje" : "zonder bonnetje";
  return `${day} · ${expense.vendor} · ${euro(expense.amountGross)} incl. ${euro(expense.vatAmount)} btw (${Number(expense.vatRate)}%) · ${receipt} · ${expense.id}`.slice(0, 500);
}
