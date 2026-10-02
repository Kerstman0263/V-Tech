// Pure browser-side parsing. Incoming bank payments are candidates for review,
// never automatically classified as business revenue.

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RECORDS = 10_000;
const MAX_AMOUNT = 99_999_999.99;

/** Strict EUR amount parser, accepting NL/international grouping and decimals. */
export function parseFiscalAmount(raw: string): number {
  if (typeof raw !== "string" || raw.length > 80) return NaN;
  let value = raw.replace(/[\u00a0\u202f]/g, " ").trim();
  let sign = 1;
  let hasSign = false;
  const takeSign = () => {
    if (/^[+-]/.test(value)) {
      if (hasSign) return false;
      hasSign = true;
      sign = value[0] === "-" ? -1 : 1;
      value = value.slice(1).trim();
    }
    return true;
  };
  if (!takeSign()) return NaN;
  let hasCurrency = false;
  const prefix = value.match(/^(?:EUR\b|€)\s*/i);
  if (prefix) {
    hasCurrency = true;
    value = value.slice(prefix[0].length);
  }
  if (!takeSign()) return NaN;
  if (value.endsWith("-")) {
    if (hasSign) return NaN;
    sign = -1;
    hasSign = true;
    value = value.slice(0, -1).trim();
  }
  const suffix = value.match(/\s*(?:\bEUR|€)$/i);
  if (suffix) {
    if (hasCurrency) return NaN;
    value = value.slice(0, -suffix[0].length).trim();
  }
  if (!value || !/^[\d., ]+$/.test(value)) return NaN;

  let integer = value;
  let fraction = "";
  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  const lastSeparator = Math.max(lastDot, lastComma);
  if (lastSeparator >= 0 && value.length - lastSeparator - 1 <= 2) {
    integer = value.slice(0, lastSeparator);
    fraction = value.slice(lastSeparator + 1);
    if (!/^\d{1,2}$/.test(fraction)) return NaN;
    // A decimal separator may not also be a thousands separator.
    if (integer.includes(value[lastSeparator])) return NaN;
  }

  if (!/^\d+$/.test(integer)) {
    const grouping = integer.includes(" ") ? " " : integer.includes(".") ? "." : ",";
    const groups = integer.split(grouping);
    if (!/^[1-9]\d{0,2}$/.test(groups[0]) || groups.length < 2 ||
        groups.slice(1).some((group) => !/^\d{3}$/.test(group))) return NaN;
    integer = groups.join("");
  }
  // Integer cents avoid rounding a malformed third decimal into a valid amount.
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > Math.round(MAX_AMOUNT * 100)) return NaN;
  return cents === 0 ? 0 : sign * cents / 100;
}

interface CsvRecord {
  cells: string[];
  valid: boolean;
}

function delimiterFor(text: string): string {
  const counts = new Map([[";", 0], [",", 0], ["\t", 0]]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (ch === "\n" || ch === "\r") break;
      if (counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** One pass, with quoted newlines and escaped quotes; no split-on-newline guesswork. */
function* records(text: string, delimiter: string): Generator<CsvRecord> {
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  let valid = true;
  const finishCell = () => {
    if (cells.length >= 128) throw new Error("CSV_COLUMN_LIMIT");
    cells.push(cell);
    cell = "";
    closedQuote = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else {
        cell += ch;
      }
    } else if (ch === delimiter) {
      finishCell();
    } else if (ch === "\n" || ch === "\r") {
      finishCell();
      if (cells.some((part) => part.trim() !== "") || !valid) yield { cells, valid };
      cells = [];
      valid = true;
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else if (closedQuote) {
      if (ch !== " " && ch !== "\t") valid = false;
    } else if (ch === '"') {
      if (cell.trim() !== "") valid = false;
      else { cell = ""; quoted = true; }
    } else {
      cell += ch;
    }
  }
  finishCell();
  if (cells.some((part) => part.trim() !== "") || !valid || quoted) {
    yield { cells, valid: valid && !quoted };
  }
}

function parseDate(raw: string): string | null {
  const value = raw.trim();
  let parts = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!parts) parts = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!parts) {
    const european = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (european) parts = [value, european[3], european[2], european[1]];
  }
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > days) return null;
  return `${parts[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const compact = (value: string) => normalize(value).replace(/[\s/_-]/g, "");
const amountHeader = /^(?:bedrag|amount|transactiebedrag|transaction amount)(?:\s*(?:\([a-z]{3}\)|[a-z]{3}))?$/;
const currencyHeaders = new Set(["munt", "valuta", "valutacode", "currency", "currencycode", "muntsoort"]);
const directionHeaders = new Set(["afbij", "bijaf", "creditdebet", "debetcredit", "creditdebit", "debitcredit", "richting", "direction"]);
const dateHeaders = ["datum", "transactiedatum", "transaction date", "date", "boekdatum", "booking date", "boekingsdatum"];
const creditDirections = new Set(["bij", "credit", "c", "cr"]);
const debitDirections = new Set(["af", "debet", "debit", "d", "dr"]);

export interface FiscalCsvRow {
  id: string;
  date: string;
  description: string;
  amount: number;
}

/**
 * Recognizes ING, Rabobank and Knab column names. Unlabelled currency follows
 * this EUR-only import's convention; any explicit foreign currency is rejected.
 * `skipped` counts invalid/unrecognized non-empty data records, not valid debit
 * or zero records. Missing date columns produce "" for manual period review.
 * Exceeding the input limits throws before any partial result is returned.
 */
export function parseFiscalCsv(text: string): { rows: FiscalCsvRow[]; skipped: number } {
  if (typeof text !== "string") throw new Error("CSV_INVALID_INPUT");
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES) {
    throw new Error("CSV_SIZE_LIMIT");
  }
  let source = text.replace(/^\uFEFF/, "").trimStart();
  let delimiter: string;
  const separator = source.match(/^sep=([;,\t])(?:\r\n|\r|\n)/i);
  if (separator) {
    delimiter = separator[1];
    source = source.slice(separator[0].length);
  } else {
    delimiter = delimiterFor(source);
  }
  const iterator = records(source, delimiter);
  const first = iterator.next();
  if (first.done) return { rows: [], skipped: 0 };
  const header = first.value.cells.map(normalize);
  const amounts = header.map((value, index) => amountHeader.test(value) ? index : -1).filter((index) => index >= 0);
  const directions = header.map((value, index) => directionHeaders.has(compact(value)) ? index : -1).filter((index) => index >= 0);
  const currencies = header.map((value, index) => currencyHeaders.has(compact(value)) ? index : -1).filter((index) => index >= 0);
  const amountIndex = amounts[0] ?? -1;
  const headerCurrency = amountIndex < 0 ? null : header[amountIndex].match(/(?:\(([a-z]{3})\)| ([a-z]{3}))$/);
  const supported = first.value.valid && amounts.length === 1 && directions.length <= 1 &&
    (!headerCurrency || (headerCurrency[1] ?? headerCurrency[2]) === "eur");
  const dateIndex = dateHeaders.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const descriptionIndexes = header.map((value, index) =>
    /^(?:omschrijving(?:[- ]?\d+)?|mededelingen?|naam(?: \/ omschrijving| tegenpartij| tegenrekening)?|description|counterparty|naam uiteindelijke partij)$/.test(value) ? index : -1,
  ).filter((index) => index >= 0);
  const rows: FiscalCsvRow[] = [];
  let skipped = 0;
  let recordNumber = 0;
  for (const record of iterator) {
    recordNumber++;
    if (recordNumber > MAX_RECORDS) throw new Error("CSV_ROW_LIMIT");
    const cells = record.cells;
    if (!supported || !record.valid || cells.length !== header.length) { skipped++; continue; }
    if (currencies.some((index) => cells[index].trim().toUpperCase() !== "EUR")) { skipped++; continue; }
    const amount = parseFiscalAmount(cells[amountIndex]);
    const date = dateIndex < 0 ? "" : parseDate(cells[dateIndex]);
    if (!Number.isFinite(amount) || date === null) { skipped++; continue; }
    let credit = amount > 0;
    if (directions.length) {
      const direction = normalize(cells[directions[0]]);
      if (!creditDirections.has(direction) && !debitDirections.has(direction)) { skipped++; continue; }
      credit = creditDirections.has(direction);
      // Unsigned debit amounts are normal in ING/Knab exports. An explicit
      // opposite sign is contradictory, so it must not become income silently.
      if ((credit && amount < 0) || (!credit && cells[amountIndex].includes("+"))) { skipped++; continue; }
    }
    if (!credit || amount === 0) continue;
    const description = descriptionIndexes.map((index) => cells[index].trim()).filter(Boolean)
      .join(" — ").replace(/\s+/g, " ").slice(0, 500);
    rows.push({ id: `csv-${recordNumber}`, date, description, amount });
  }
  return { rows, skipped };
}
