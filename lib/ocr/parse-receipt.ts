/**
 * Bonnetjes-heuristiek: haalt uit ruwe OCR-tekst het totaalbedrag, de datum,
 * het btw-tarief en de leverancier. Puur en zonder afhankelijkheden, zodat
 * het zowel in de browser (Tesseract) als op de server (clouddienst-fallback)
 * werkt en goed te testen is.
 *
 * Bewust een "voorstel": de gebruiker controleert de velden altijd nog.
 */
export interface ParsedReceipt {
  vendor: string | null;
  total: number | null;
  date: string | null; // YYYY-MM-DD
  vatRate: 0 | 9 | 21 | null;
  vatAmount: number | null;
  /** 0..1 — hoeveel signalen we vonden; puur ter indicatie in de UI */
  confidence: number;
}

const TOTAL_WORDS = /\b(totaal|total|te\s*betalen|eindtotaal|te\s*voldoen|amount\s*due|subtotaal|bedrag)\b/i;
const VAT_WORDS = /\b(btw|vat|omzetbelasting|tax)\b/i;
// Bedragen: 12,34 / 12.34 / 1.234,56 / € 12,34 / 12,34 EUR
const AMOUNT_RE = /(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2}))(?!\d)/g;

/** "1.234,56" of "1,234.56" of "12.34" -> 1234.56 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[€\s]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // NL: punt = duizendtal, komma = decimaal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // EN: komma = duizendtal, punt = decimaal
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** dd-mm-yyyy, dd/mm/yy, dd.mm.yyyy, yyyy-mm-dd, "12 aug 2026" */
export function parseDate(text: string): string | null {
  const now = new Date();
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);

  const dmy = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dmy) {
    let y = +dmy[3];
    if (y < 100) y += 2000;
    return build(y, +dmy[2], +dmy[1]);
  }

  const months: Record<string, number> = {
    jan: 1, feb: 2, mrt: 3, maa: 3, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dec: 12,
  };
  const named = text.match(/\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(20\d{2})\b/i);
  if (named) {
    const m = months[named[2].toLowerCase()];
    if (m) return build(+named[3], m, +named[1]);
  }
  return null;

  function build(y: number, m: number, d: number): string | null {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (y < 2000 || y > now.getFullYear() + 1) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // --- Totaal: voorkeur voor een regel met een totaal-woord; anders het hoogste bedrag ---
  let total: number | null = null;
  const totalCandidates: number[] = [];
  const allAmounts: number[] = [];
  for (const line of lines) {
    const amounts = [...line.matchAll(AMOUNT_RE)].map((m) => parseAmount(m[1])).filter((n): n is number => n !== null);
    if (amounts.length === 0) continue;
    allAmounts.push(...amounts);
    if (TOTAL_WORDS.test(line) && !/subtotaal|sub\s*total|excl/i.test(line)) {
      totalCandidates.push(Math.max(...amounts));
    }
  }
  if (totalCandidates.length > 0) total = Math.max(...totalCandidates);
  else if (allAmounts.length > 0) total = Math.max(...allAmounts);

  // --- Btw-tarief: expliciet percentage op een btw-regel, anders afleiden uit btw-bedrag ---
  let vatRate: 0 | 9 | 21 | null = null;
  let vatAmount: number | null = null;
  for (const line of lines) {
    if (!VAT_WORDS.test(line)) continue;
    const pct = line.match(/(\d{1,2})\s*%/);
    if (pct) {
      const p = +pct[1];
      if (p === 21 || p === 9 || p === 0) vatRate = p;
    }
    const amounts = [...line.matchAll(AMOUNT_RE)].map((m) => parseAmount(m[1])).filter((n): n is number => n !== null);
    if (amounts.length > 0 && !pct) vatAmount = amounts[amounts.length - 1];
    else if (amounts.length > 0) vatAmount = amounts[amounts.length - 1];
  }
  if (vatRate === null && vatAmount !== null && total !== null && total > 0) {
    // btw-deel van een bruto-bedrag: 21% -> 17,36%, 9% -> 8,26%
    const share = vatAmount / total;
    if (Math.abs(share - 0.1736) < 0.02) vatRate = 21;
    else if (Math.abs(share - 0.0826) < 0.015) vatRate = 9;
  }
  if (vatRate !== null && vatAmount === null && total !== null) {
    vatAmount = Math.round((total - total / (1 + vatRate / 100)) * 100) / 100;
  }

  // --- Datum ---
  const date = parseDate(text);

  // --- Leverancier: eerste "naam-achtige" regel bovenaan (letters, geen bedrag, niet te lang) ---
  let vendor: string | null = null;
  for (const line of lines.slice(0, 6)) {
    if (line.length < 3 || line.length > 40) continue;
    if (AMOUNT_RE.test(line)) {
      AMOUNT_RE.lastIndex = 0;
      continue;
    }
    AMOUNT_RE.lastIndex = 0;
    if (!/[a-z]{3,}/i.test(line)) continue;
    if (/^(bon|kassabon|factuur|invoice|receipt|datum|date|tel|www|http)/i.test(line)) continue;
    vendor = line.replace(/\s{2,}/g, " ");
    break;
  }

  const signals = [total !== null, date !== null, vatRate !== null, vendor !== null].filter(Boolean).length;
  return { vendor, total, date, vatRate, vatAmount, confidence: signals / 4 };
}
