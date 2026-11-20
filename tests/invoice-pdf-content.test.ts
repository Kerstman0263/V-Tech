import { describe, expect, it } from "vitest";
import { invoicePdfContent, korNoticeFromNotes } from "@/lib/invoice-pdf-content";
import { originalNumberFromNotes, type CreditLookupDb } from "@/lib/credit-reference";
import { creditNoteTemplates, korNoticeTexts } from "@/lib/pdf-labels";

// Nep-database: logboek en facturen naar keuze, en telt de aanroepen.
function fakeDb(opts: { logTarget?: string | null; originalDate?: Date | null; fail?: boolean } = {}) {
  const calls = { auditLog: 0, invoice: 0 };
  const db: CreditLookupDb = {
    auditLog: {
      findFirst: async () => {
        calls.auditLog++;
        if (opts.fail) throw new Error("db weg");
        return opts.logTarget ? { target: opts.logTarget } : null;
      },
    },
    invoice: {
      findFirst: async () => {
        calls.invoice++;
        if (opts.fail) throw new Error("db weg");
        return opts.originalDate ? { issueDate: opts.originalDate } : null;
      },
    },
  };
  return { db, calls };
}

const [korNl, korEn] = korNoticeTexts();

describe("PDF-inhoud: KOR-zin alleen uit de opgeslagen factuur", () => {
  it("oude factuur tegen 0% zonder KOR-zin krijgt er achteraf geen (ook niet als de KOR nu aan staat)", async () => {
    // De functie krijgt de huidige instellingen niet eens: alleen wat bij de factuur staat telt.
    const { db } = fakeDb();
    const content = await invoicePdfContent(db, "acc", { invoiceNumber: "2025-0003", total: 500, notes: "Btw verlegd naar de afnemer." });
    expect(content.notices).toEqual([]);
    expect(content.notes).toBe("Btw verlegd naar de afnemer.");
    expect(content.isCredit).toBe(false);
  });

  it("de KOR-zin uit de opmerkingen wordt een vast onderdeel, in de opgeslagen taal", async () => {
    const { db } = fakeDb();
    const nl = await invoicePdfContent(db, "acc", { invoiceNumber: "2026-0001", total: 100, notes: `Dank je wel!\n\n${korNl}` });
    expect(nl.notices).toEqual([korNl]);
    expect(nl.notes).toBe("Dank je wel!");
    const en = await invoicePdfContent(db, "acc", { invoiceNumber: "2026-0002", total: 100, notes: korEn });
    expect(en.notices).toEqual([korEn]);
    expect(en.notes).toBeNull();
  });

  it("een KOR-ondernemer die de zin bewust weghaalde, krijgt hem niet terug", async () => {
    const { db } = fakeDb();
    const content = await invoicePdfContent(db, "acc", { invoiceNumber: "2026-0004", total: 100, notes: "Btw verlegd (EU-dienst)." });
    expect(content.notices).toEqual([]);
    expect(korNoticeFromNotes(null)).toBeNull();
  });
});

describe("PDF-inhoud: creditfacturen", () => {
  it("gewone factuur: geen credit en geen database-aanroep", async () => {
    const { db, calls } = fakeDb({ logTarget: "x" });
    const content = await invoicePdfContent(db, "acc", { invoiceNumber: "2026-0010", total: 121, notes: null });
    expect(content).toEqual({ isCredit: false, creditReference: null, notices: [], notes: null });
    expect(calls).toEqual({ auditLog: 0, invoice: 0 });
  });

  it("nieuwe creditfactuur gebruikt de opgeslagen verwijzing", async () => {
    const { db, calls } = fakeDb();
    const date = new Date("2026-10-01T00:00:00Z");
    const content = await invoicePdfContent(db, "acc", {
      invoiceNumber: "2026-0050", total: -121, notes: "Creditfactuur voor factuur 2026-0007.\n\nOude opmerking",
      originalInvoiceNumber: "2026-0007", originalInvoiceDate: date,
    });
    expect(content.isCredit).toBe(true);
    expect(content.creditReference).toEqual({ number: "2026-0007", date });
    expect(content.notes).toBe("Oude opmerking");
    expect(calls.auditLog).toBe(0);
  });

  it("oude creditfactuur zonder velden: via het logboek, zin uit de opmerkingen", async () => {
    const date = new Date("2026-09-01T00:00:00Z");
    const { db } = fakeDb({ logTarget: "2026-0007 → 2026-0050", originalDate: date });
    const content = await invoicePdfContent(db, "acc", { invoiceNumber: "2026-0050", total: -121, notes: "Creditfactuur voor factuur 2026-0007.\n\nOude opmerking" });
    expect(content.isCredit).toBe(true);
    expect(content.creditReference).toEqual({ number: "2026-0007", date });
    expect(content.notes).toBe("Oude opmerking");
  });

  it("creditfactuur waarvan het logboek ontbreekt: nummer uit de opmerkingen", async () => {
    const date = new Date("2026-09-01T00:00:00Z");
    const { db } = fakeDb({ logTarget: null, originalDate: date });
    const content = await invoicePdfContent(db, "acc", { invoiceNumber: "2026-0050", total: -121, notes: "Credit note for invoice INV/2026/7.\n\nNote" });
    expect(content.creditReference).toEqual({ number: "INV/2026/7", date });
    expect(content.notes).toBe("Note");
  });

  it("creditfactuur zonder logboek en zonder zin: blijft een creditfactuur, opmerkingen blijven staan", async () => {
    const { db } = fakeDb({ logTarget: null });
    const content = await invoicePdfContent(db, "acc", { invoiceNumber: "2026-0050", total: -121, notes: "Retour van 2 stuks." });
    expect(content.isCredit).toBe(true);
    expect(content.creditReference).toBeNull();
    expect(content.notes).toBe("Retour van 2 stuks.");
  });

  it("database weg: de PDF krijgt toch de verwijzing uit de opmerkingen (zonder datum)", async () => {
    const { db } = fakeDb({ fail: true });
    const content = await invoicePdfContent(db, "acc", { invoiceNumber: "2026-0050", total: -121, notes: "Creditfactuur voor factuur 2026-0007." });
    expect(content.creditReference).toEqual({ number: "2026-0007", date: null });
    expect(content.notes).toBeNull();
  });

  it("leest het originele nummer alleen uit het begin van de opmerkingen", () => {
    const templates = creditNoteTemplates();
    expect(originalNumberFromNotes("Creditfactuur voor factuur 2026-0007.", templates)).toBe("2026-0007");
    expect(originalNumberFromNotes("  Creditfactuur voor factuur 2026-0007.\n\nx", templates)).toBe("2026-0007");
    expect(originalNumberFromNotes("Zie Creditfactuur voor factuur 2026-0007.", templates)).toBeNull();
    expect(originalNumberFromNotes(null, templates)).toBeNull();
    expect(originalNumberFromNotes("Creditfactuur voor factuur 2026-0007.", [])).toBeNull();
  });
});
