import { describe, it, expect } from "vitest";
import { parseBankCsvRows, parseAmount } from "@/lib/bank-parse";

describe("parseAmount", () => {
  it("leest NL- en intl-notatie", () => {
    expect(parseAmount("1.210,00")).toBe(1210);
    expect(parseAmount("45,20")).toBe(45.2);
    expect(parseAmount("-45,20")).toBe(-45.2);
    expect(parseAmount("1210.00")).toBe(1210);
  });
});

describe("parseBankCsvRows", () => {
  const ing = [
    '"Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij","Bedrag (EUR)","Mutatiesoort","Mededelingen"',
    '"20260805","Acme B.V.","NL01","NL02","OV","Bij","1210,00","Overschrijving","Factuur 2026-0007"',
    '"20260803","Albert Heijn","NL01","","BA","Af","45,20","Betaalautomaat","Boodschappen"',
  ].join("\n");

  it("leest een ING-achtige CSV met richting uit de Af/Bij-kolom", () => {
    const rows = parseBankCsvRows(ing)!;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-08-05", amount: 1210, direction: "CREDIT" });
    expect(rows[0].description).toContain("2026-0007");
    expect(rows[1]).toMatchObject({ date: "2026-08-03", amount: 45.2, direction: "DEBIT" });
  });

  it("leidt richting af uit het teken als er geen Af/Bij-kolom is", () => {
    const csv = ["Datum;Omschrijving;Bedrag", "2026-08-05;Betaling;1210,00", "2026-08-04;Kosten;-12,50"].join("\n");
    const rows = parseBankCsvRows(csv)!;
    expect(rows[0].direction).toBe("CREDIT");
    expect(rows[1].direction).toBe("DEBIT");
    expect(rows[1].amount).toBe(12.5);
  });

  it("geeft null bij onherkenbare inhoud", () => {
    expect(parseBankCsvRows("dit is geen csv")).toBeNull();
  });
});
