// Pure, framework-onafhankelijke parser voor bank-CSV's (ING, Rabobank, Knab).
// Geeft losse transactieregels terug (datum, bedrag, richting, omschrijving).
// Bewust geen imports zodat dit zowel client- als serverside bruikbaar is.

export interface ParsedTx {
  date: string; // YYYY-MM-DD
  amount: number; // altijd positief
  direction: "CREDIT" | "DEBIT";
  description: string;
}

export function parseAmount(raw: string): number {
  let s = (raw ?? "").replace(/["'\s€]/g, "");
  if (!s) return NaN;
  const negative = /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[+\-]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let n: string;
  if (lastComma > -1 && lastDot > -1) {
    n = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    n = s.replace(",", ".");
  } else if (lastDot > -1 && s.length - lastDot - 1 === 3 && s.replace(".", "").length > 3) {
    n = s.replace(/\./g, "");
  } else {
    n = s;
  }
  const v = parseFloat(n);
  if (isNaN(v)) return NaN;
  return negative ? -Math.abs(v) : v;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const pad = (s: string) => s.padStart(2, "0");

function parseDate(raw: string): string | null {
  const s = (raw ?? "").replace(/["]/g, "").trim();
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/); // 20260807 (ING)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/); // 2026-08-07
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); // 07-08-2026
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

/** Best-effort parser. Geeft null als het geen herkenbare bank-CSV is. */
export function parseBankCsvRows(text: string): ParsedTx[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;

  const semi = (lines[0].match(/;/g) || []).length;
  const comma = (lines[0].match(/,/g) || []).length;
  const delim = semi > comma ? ";" : ",";

  const header = splitCsvLine(lines[0], delim).map((h) => h.toLowerCase().replace(/"/g, "").trim());
  const amountIdx = header.findIndex((h) => h === "bedrag" || h === "amount" || h.startsWith("bedrag"));
  const dateIdx = header.findIndex((h) => h.includes("datum") || h === "date");
  if (amountIdx === -1 || dateIdx === -1) return null;

  const dirIdx = header.findIndex((h) => /af.?bij|bij.?af|debet|credit|debit/.test(h));
  // Omschrijvingskolommen (naam + mededelingen/omschrijving) samenvoegen.
  const descIdxs = header
    .map((h, i) => (/omschrijving|mededeling|naam|tegenpartij|description|counterparty/.test(h) ? i : -1))
    .filter((i) => i > -1);

  const rows: ParsedTx[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r], delim);
    const amt = parseAmount(cols[amountIdx] ?? "");
    const date = parseDate(cols[dateIdx] ?? "");
    if (isNaN(amt) || amt === 0 || !date) continue;

    let credit: boolean;
    if (dirIdx > -1) {
      const dir = (cols[dirIdx] ?? "").toLowerCase().replace(/"/g, "").trim();
      credit = dir.includes("bij") || dir.includes("credit") || dir === "c" || dir === "cr";
    } else {
      credit = amt > 0;
    }

    const description = (descIdxs.length ? descIdxs.map((i) => cols[i]).filter(Boolean).join(" — ") : cols.join(" "))
      .replace(/"/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300) || "—";

    rows.push({ date, amount: Math.abs(amt), direction: credit ? "CREDIT" : "DEBIT", description });
  }
  if (rows.length === 0) return null;
  return rows;
}
