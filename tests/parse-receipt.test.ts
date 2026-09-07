import { describe, it, expect } from "vitest";
import { parseAmount, parseDate, parseReceipt } from "@/lib/ocr/parse-receipt";

describe("parseAmount", () => {
  it("leest NL- en EN-notaties", () => {
    expect(parseAmount("12,34")).toBe(12.34);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("€ 9,99")).toBe(9.99);
    expect(parseAmount("0,00")).toBeNull();
  });
});

describe("parseDate", () => {
  it("herkent de gangbare Nederlandse vormen", () => {
    expect(parseDate("Datum: 12-08-2026 14:03")).toBe("2026-08-12");
    expect(parseDate("12/08/26")).toBe("2026-08-12");
    expect(parseDate("2026-08-12")).toBe("2026-08-12");
    expect(parseDate("Utrecht, 3 aug 2026")).toBe("2026-08-03");
    expect(parseDate("31-02-2026")).toBeNull(); // bestaat niet
  });
});

describe("parseReceipt", () => {
  const bon = `
    ALBERT HEIJN
    Filiaal 1234 Amsterdam
    12-08-2026 18:41
    Brood volkoren          2,49
    Melk halfvol 1L         1,29
    Kaas jong belegen      5,98
    SUBTOTAAL               9,76
    BTW 9%                  0,81
    TOTAAL                  9,76
    PIN                     9,76
  `;

  it("pakt totaal, datum, btw en leverancier van een kassabon", () => {
    const r = parseReceipt(bon);
    expect(r.vendor).toBe("ALBERT HEIJN");
    expect(r.total).toBe(9.76);
    expect(r.date).toBe("2026-08-12");
    expect(r.vatRate).toBe(9);
    expect(r.vatAmount).toBe(0.81);
    expect(r.confidence).toBe(1);
  });

  it("leidt 21% af uit het btw-bedrag als het percentage ontbreekt", () => {
    const r = parseReceipt(`Coolblue\nMonitor 27 inch  242,00\nTotaal  242,00\nwaarvan btw  42,00`);
    expect(r.total).toBe(242);
    expect(r.vatRate).toBe(21);
  });

  it("valt terug op het hoogste bedrag zonder totaal-woord", () => {
    const r = parseReceipt(`Tankstation Shell\n15-07-2026\nEuro 95   65,40\nRuitenwisservloeistof 4,99`);
    expect(r.total).toBe(65.4);
    expect(r.vendor).toBe("Tankstation Shell");
    expect(r.vatRate).toBeNull();
    expect(r.confidence).toBe(0.75);
  });
});
