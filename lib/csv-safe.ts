/**
 * CSV-cellen voor Excel en andere spreadsheets.
 *
 * Een tekstcel die begint met =, +, -, @, tab of een regeleinde (\r of \n) kan
 * in een spreadsheet als formule worden uitgevoerd ("CSV-injectie"). Zulke
 * tekst krijgt een apostrof ervoor, zodat hij gewoon als tekst wordt getoond.
 * Bedragen en datums maken we zelf op en gaan ongewijzigd door, zodat een
 * negatief bedrag geen apostrof krijgt.
 *
 * Puur (geen server-code): ook te gebruiken in de exports in de browser.
 */
const FORMULA_START = /^[=+\-@\t\r\n]/;
/** Een opgemaakt bedrag of getal: -12,50 / 12.50 / 3 / 1.234,56. */
const PLAIN_NUMBER = /^-?\d[\d.,]*$/;

export function neutralizeCsvText(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/**
 * Eén cel tussen dubbele aanhalingstekens; tekst wordt eerst onschadelijk gemaakt.
 * "amount": een bedrag, getal of datum die we zelf opmaken. Is het toch geen
 * gewoon getal, dan wordt het als tekst behandeld.
 */
export function csvCell(value: string | number, kind: "text" | "amount" = "text"): string {
  const raw = String(value);
  const safe = kind === "amount" && PLAIN_NUMBER.test(raw) ? raw : neutralizeCsvText(raw);
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Een bedrag of getal dat ongewijzigd in de CSV moet (ook als het negatief is). */
export interface CsvAmount {
  readonly csvAmount: string;
}

export function csvAmount(value: string | number): CsvAmount {
  return { csvAmount: String(value) };
}

/** Een waarde in een CSV-rij. Getallen (number) zijn altijd bedragen; tekst wordt veilig gemaakt. */
export type CsvValue = string | number | CsvAmount | null | undefined;

function cellOf(value: CsvValue): string {
  if (value === null || value === undefined) return csvCell("");
  if (typeof value === "number") return csvCell(value, "amount");
  if (typeof value === "object") return csvCell(value.csvAmount, "amount");
  return csvCell(value);
}

/** Eén rij: cellen met puntkomma's (Excel-NL). */
export function csvRow(values: CsvValue[]): string {
  return values.map(cellOf).join(";");
}

/**
 * Hele CSV voor Excel-NL: BOM, puntkomma en regeleinde \r\n.
 * Gebruik deze helper voor elke export, zodat geen cel als formule wordt uitgevoerd.
 */
export function toCsv(rows: CsvValue[][]): string {
  return "﻿" + rows.map(csvRow).join("\r\n");
}
