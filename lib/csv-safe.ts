/**
 * CSV-cellen voor Excel en andere spreadsheets.
 *
 * Een tekstcel die begint met =, +, -, @, tab of een regeleinde kan in een
 * spreadsheet als formule worden uitgevoerd ("CSV-injectie"). Zulke tekst
 * krijgt een apostrof ervoor, zodat hij gewoon als tekst wordt getoond.
 * Bedragen en datums maken we zelf op en gaan ongewijzigd door.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function neutralizeCsvText(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Eén cel tussen dubbele aanhalingstekens; tekst wordt eerst onschadelijk gemaakt. */
export function csvCell(value: string | number, kind: "text" | "amount" = "text"): string {
  const raw = String(value);
  const safe = kind === "text" ? neutralizeCsvText(raw) : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
