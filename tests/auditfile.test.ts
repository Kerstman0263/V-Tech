import { describe, expect, it } from "vitest";
import { buildJournal, buildXaf, isBalanced, journalCsv, vatCode } from "@/lib/auditfile";

const inv = (o: Partial<Parameters<typeof buildJournal>[0][number]> = {}) => ({
  id: "inv1", invoiceNumber: "2026-0001", issueDate: new Date("2026-03-01T00:00:00Z"), status: "SENT",
  subtotal: 100, vatAmount: 21, total: 121, customerId: "c1", customerName: "Klant BV", paidAt: null, ...o,
});
const exp = (o: Partial<Parameters<typeof buildJournal>[1][number]> = {}) => ({
  id: "expense00000001", date: new Date("2026-04-10T00:00:00Z"), vendor: "Coolblue", description: "Laptop", category: "EQUIPMENT",
  amountGross: 1210, vatRate: 21, vatAmount: 210, ...o,
});

describe("buildJournal", () => {
  it("verkoopfactuur: debiteuren tegen omzet + btw, in balans", () => {
    const [e] = buildJournal([inv()], [], 2026);
    expect(e.journal).toBe("VRK");
    expect(e.lines.map((l) => l.account)).toEqual(["1300", "8000", "1500"]);
    expect(isBalanced(e)).toBe(true);
    expect(e.lines[1].vatCode).toBe("H");
  });
  it("betaalde factuur krijgt ook een bankboeking", () => {
    const es = buildJournal([inv({ status: "PAID", paidAt: new Date("2026-03-15T00:00:00Z") })], [], 2026);
    expect(es.map((e) => e.journal)).toEqual(["VRK", "BNK"]);
    expect(es[1].lines.map((l) => l.account)).toEqual(["1100", "1300"]);
    expect(isBalanced(es[1])).toBe(true);
  });
  it("creditfactuur (negatief) boekt omgekeerd en blijft in balans", () => {
    const [e] = buildJournal([inv({ subtotal: -100, vatAmount: -21, total: -121 })], [], 2026);
    expect(e.lines[0].credit).toBe(121);
    expect(e.lines[1].debit).toBe(100);
    expect(isBalanced(e)).toBe(true);
  });
  it("uitgave: kostenrekening per categorie + voorbelasting tegen crediteuren", () => {
    const [e] = buildJournal([], [exp()], 2026);
    expect(e.journal).toBe("INK");
    expect(e.lines.map((l) => l.account)).toEqual(["4200", "1520", "1600"]);
    expect(e.lines[0].debit).toBe(1000);
    expect(isBalanced(e)).toBe(true);
  });
  it("concepten en andere jaren worden overgeslagen; sortering op datum", () => {
    const es = buildJournal([inv({ status: "DRAFT" }), inv({ id: "x", issueDate: new Date("2025-12-31T00:00:00Z") })], [exp()], 2026);
    expect(es.length).toBe(1);
  });
});

describe("vatCode", () => {
  it("21 -> H, 9 -> L, 0 -> N", () => {
    expect(vatCode(21)).toBe("H"); expect(vatCode(9)).toBe("L"); expect(vatCode(0)).toBe("N");
  });
});

describe("buildXaf / journalCsv", () => {
  const entries = buildJournal([inv({ status: "PAID", paidAt: new Date("2026-03-15T00:00:00Z") })], [exp()], 2026);
  it("levert geldige XAF 3.2-structuur met totalen in balans en escaped tekst", () => {
    const xml = buildXaf({ name: "Test & Co <BV>", kvk: "12345678", vatNumber: "NL001234567B01" }, 2026, entries, [{ id: "c1", name: "Klant BV" }], new Date("2026-08-27T00:00:00Z"));
    expect(xml).toContain('<auditfile xmlns="http://www.auditfiles.nl/XAF/3.2"');
    expect(xml).toContain("<companyName>Test &amp; Co &lt;BV&gt;</companyName>");
    expect(xml).toContain("<fiscalYear>2026</fiscalYear>");
    const d = xml.match(/<totalDebit>([\d.]+)<\/totalDebit>/g)!.pop();
    const c = xml.match(/<totalCredit>([\d.]+)<\/totalCredit>/g)!.pop();
    expect(d!.replace(/\D/g, "")).toBe(c!.replace(/\D/g, ""));
    expect(xml).toContain("<jrnID>VRK</jrnID>");
    expect(xml).toContain("<custSupID>c1</custSupID>");
  });
  it("csv heeft BOM, puntkomma en komma-decimaal", () => {
    const csv = journalCsv(entries);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"2026-03-01";"VRK";"2026-0001";"1300";"Debiteuren"');
    expect(csv).toContain('"121,00";"0,00"');
  });
});
