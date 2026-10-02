import { describe, expect, it } from "vitest";
import { parseFiscalAmount, parseFiscalCsv } from "@/lib/fiscal-csv";

describe("parseFiscalAmount", () => {
  it.each([
    ["1.234,56", 1234.56], ["1,234.56", 1234.56], ["1234,5", 1234.5],
    ["1234.50", 1234.5], ["€ 1.234,56", 1234.56], ["1 234,56 EUR", 1234.56],
    ["EUR -12,30", -12.3], ["- € 12,30", -12.3], ["12,30-", -12.3],
    ["+12.30", 12.3], ["1.234", 1234], ["1,234", 1234],
    ["1.234.567,89", 1234567.89], ["1,234,567.89", 1234567.89],
    ["1\u00a0234,56", 1234.56], ["1\u202f234.56", 1234.56],
    ["0", 0], ["-0,00", 0], ["0,01", 0.01], ["99.999.999,99", 99999999.99],
  ])("parses %s strictly", (raw, expected) => {
    expect(parseFiscalAmount(raw as string)).toBe(expected);
  });

  it.each([
    "", " ", "12,30garbage", "12,30 factuur", "12e3", "Infinity", "NaN", "USD 12.30", "$12.30",
    "1.23.4", "1,2,3", "1.234,567", "1234.567", "0.123", "12.3456", "12,", ".50", "12..30",
    "--12", "-+12", "12-30", "+12-", "EUR € 12", "€ 12 EUR", "12 34", "1 234.567,89",
    "100.000.000,00", "99999999999999999999999999999", '"12,30"', "12\n30",
  ])("rejects %s without accepting a numeric prefix", (raw) => {
    expect(parseFiscalAmount(raw)).toBeNaN();
  });
});

describe("parseFiscalCsv", () => {
  it("reads ING with BOM, CRLF, quoted commas and escaped quotes; excludes ordinary debits", () => {
    const result = parseFiscalCsv([
      '\uFEFF"Datum","Naam / Omschrijving","Rekening","Af Bij","Bedrag (EUR)","Mededelingen"',
      '"20260901","Klant, B.V.","NL01","Bij","1.210,00","Factuur ""ABC"""',
      '"20260902","Winkel","NL01","Af","45,20","Kosten"',
      '"20260903","Geen mutatie","NL01","Bij","0,00",""',
    ].join("\r\n"));
    expect(result).toEqual({ rows: [{
      id: "csv-1", date: "2026-09-01", description: 'Klant, B.V. — Factuur "ABC"', amount: 1210,
    }], skipped: 0 });
  });

  it("reads signed Rabobank amounts and the transaction currency, not foreign original amounts", () => {
    const result = parseFiscalCsv([
      'IBAN/BBAN;Munt;Datum;Rentedatum;Bedrag;Saldo na trn;Naam tegenpartij;Omschrijving-1;Omschrijving-2;Oorspr bedrag;Oorspr munt',
      'NL01;EUR;2026-09-01;2026-09-02;+1.234,56;8000,00;Klant;Factuur;2026-003;1500,00;USD',
      'NL01;EUR;2026-09-02;2026-09-03;-12,30;7987,70;Leverancier;Kosten;;;',
      'NL02;USD;2026-09-03;2026-09-04;900,00;5000,00;Klant;Dollarbetaling;;;',
    ].join("\n"));
    expect(result.rows).toEqual([{ id: "csv-1", date: "2026-09-01", description: "Klant — Factuur — 2026-003", amount: 1234.56 }]);
    expect(result.skipped).toBe(1);
  });

  it("reads Knab CreditDebet and Transactiedatum columns", () => {
    const result = parseFiscalCsv([
      'Rekeningnummer;Transactiedatum;Valutacode;CreditDebet;Bedrag;Naam tegenrekening;Omschrijving',
      'NL01;01-09-2026;EUR;C;250,00;Klant;Betaling',
      'NL01;02-09-2026;EUR;D;15,00;Winkel;Aankoop',
    ].join("\n"));
    expect(result).toEqual({ rows: [{ id: "csv-1", date: "2026-09-01", description: "Klant — Betaling", amount: 250 }], skipped: 0 });
  });

  it("requires exact, non-contradictory directions when a direction column exists", () => {
    const result = parseFiscalCsv([
      'Datum;Bedrag (EUR);Af/Bij',
      '2026-09-01;100,00;Bij',
      '2026-09-01;-100,00;Bij',
      '2026-09-01;100,00;',
      '2026-09-01;100,00;geen bijschrijving',
      '2026-09-01;100,00;Credit/Debit',
      '2026-09-01;+100,00;Af',
      '2026-09-01;-100,00;Af',
      '2026-09-01;100,00;Af',
    ].join("\n"));
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toBe(5);
  });

  it("validates calendar dates including leap years; does not use the value date", () => {
    const result = parseFiscalCsv([
      'Datum;Rentedatum;Bedrag',
      '2024-02-29;2024-03-01;1',
      '2025-02-29;2025-03-01;1',
      '2026-04-31;2026-05-01;1',
      '2026-13-01;2026-01-01;1',
      ';2026-01-01;1',
      '16/09/2026;2026-09-17;1',
      '2026/9/17;2026-09-18;1',
    ].join("\n"));
    expect(result.rows.map((row) => row.date)).toEqual(["2024-02-29", "2026-09-16", "2026-09-17"]);
    expect(result.skipped).toBe(4);
  });

  it("leaves dates empty when no recognized date column exists", () => {
    expect(parseFiscalCsv("Omschrijving;Bedrag\nHandmatige controle;12,50")).toEqual({
      rows: [{ id: "csv-1", date: "", description: "Handmatige controle", amount: 12.5 }], skipped: 0,
    });
  });

  it("handles quoted multiline descriptions, a separator directive and blank lines", () => {
    const result = parseFiscalCsv('sep=;\r\nDate;Amount;Currency;Description\r\n\r\n2026-09-16;"1,234.56";EUR;"Part one;\r\npart ""two"""\r\n');
    expect(result).toEqual({ rows: [{ id: "csv-1", date: "2026-09-16", description: 'Part one; part "two"', amount: 1234.56 }], skipped: 0 });
  });

  it("skips malformed records instead of partially parsing numbers or quotes", () => {
    const result = parseFiscalCsv([
      'Datum;Bedrag;Omschrijving',
      '2026-09-01;12,34foo;Ongeldig',
      '2026-09-01;12,34;Te;veel',
      '2026-09-01;12,34',
      '2026-09-01;12,34;"quote"tail',
      '2026-09-01;12,34;un"quoted',
      '2026-09-01;12,34;Geldig',
      '2026-09-01;12,34;"niet gesloten',
    ].join("\n"));
    expect(result.rows).toEqual([{ id: "csv-6", date: "2026-09-01", description: "Geldig", amount: 12.34 }]);
    expect(result.skipped).toBe(6);
  });

  it.each([
    ['Datum;Saldo na trn\n2026-09-16;5000', 1],
    ['Datum;Bedrag;Amount\n2026-09-16;12;13', 1],
    ['Datum;Bedrag (USD)\n2026-09-16;12', 1],
    ['Datum;Bedrag;Munt\n2026-09-16;12;', 1],
    ['Datum;Bedrag;Af Bij;CreditDebet\n2026-09-16;12;Bij;C', 1],
    ['dit is geen csv', 0],
    ['', 0],
  ])("does not return fabricated transactions from unsupported data", (csv, skipped) => {
    expect(parseFiscalCsv(csv as string)).toEqual({ rows: [], skipped });
  });

  it("accepts 10,000 data records and rejects a larger import without returning a partial result", () => {
    const row = "2026-09-16;1,00\n";
    expect(parseFiscalCsv(`Datum;Bedrag\n${row.repeat(10_000)}`).rows).toHaveLength(10_000);
    expect(() => parseFiscalCsv(`Datum;Bedrag\n${row.repeat(10_001)}`)).toThrow("CSV_ROW_LIMIT");
  });

  it("enforces UTF-8 byte size and bounded column count", () => {
    expect(() => parseFiscalCsv("x".repeat(2 * 1024 * 1024 + 1))).toThrow("CSV_SIZE_LIMIT");
    expect(() => parseFiscalCsv("€".repeat(700_000))).toThrow("CSV_SIZE_LIMIT");
    expect(() => parseFiscalCsv("x;".repeat(129))).toThrow("CSV_COLUMN_LIMIT");
  });
});
