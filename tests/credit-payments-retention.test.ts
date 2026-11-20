import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findCreditNoteFor, findCreditedOriginalId, isOpenReceivable, markOriginalCredited, openReceivableWhere } from "@/lib/invoice-credit";
import { creditNumberFromAuditTarget } from "@/lib/credit-reference";
import { invoicePaymentStatusChange, summarizeInvoicePayments } from "@/lib/invoice-payments";
import { depositDelivery, depositInvoiceTotal, depositLines, depositToSettle } from "@/lib/quote-invoice";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { customerDeleteDecision, isDeletableQuote, quoteDeleteBlock, quoteStatusChangeBlock } from "@/lib/quote-retention";
import { expenseDeleteBlock, expenseEditBlock, expenseLogTarget, isVatPeriodClosed, vatQuarterOf } from "@/lib/expense-period";
import { bankMatchError } from "@/lib/bank-matching";
import { buildReport } from "@/lib/reports";

/**
 * Pakket "Creditnota's, status, betalingen en offertes":
 * nr 7 en 55 (gecrediteerde facturen), 30 (Mollie netto), 54 en 56
 * (aanbetaling), 40 (offertes en klanten), 42 (uitgaven na de aangifte).
 */

describe("gecrediteerde factuur staat niet open (nr 7)", () => {
  it("verzonden of te laat met creditedAt telt niet als openstaand", () => {
    expect(isOpenReceivable({ status: "SENT", total: 500, creditedAt: null })).toBe(true);
    expect(isOpenReceivable({ status: "OVERDUE", total: "500.00" })).toBe(true);
    expect(isOpenReceivable({ status: "SENT", total: 500, creditedAt: new Date() })).toBe(false);
    expect(isOpenReceivable({ status: "OVERDUE", total: 500, creditedAt: "2026-11-01T00:00:00.000Z" })).toBe(false);
  });
  it("een creditfactuur (negatief) en betaalde, concept- of vervallen facturen staan ook niet open", () => {
    expect(isOpenReceivable({ status: "SENT", total: -500 })).toBe(false);
    for (const status of ["DRAFT", "PAID", "CANCELED"]) expect(isOpenReceivable({ status, total: 500 })).toBe(false);
  });
  it("het Prisma-filter volgt dezelfde regel", () => {
    expect(openReceivableWhere).toEqual({ status: { in: ["SENT", "OVERDUE"] }, creditedAt: null, total: { gt: 0 } });
  });
  it("ouderdom debiteuren telt de gecrediteerde factuur en de creditfactuur niet mee", () => {
    const base = { issueDate: new Date("2026-10-01"), dueDate: new Date("2026-10-15"), subtotal: 100, vatAmount: 21, customerName: "Klant" };
    const report = buildReport(2026, [
      { ...base, status: "OVERDUE", total: 121, creditedAt: new Date("2026-10-20") },
      { ...base, status: "SENT", total: -121, dueDate: null },
      { ...base, status: "OVERDUE", total: 242 },
    ], [], new Array(12).fill(0));
    expect(report.aging.openCount).toBe(1);
    expect(report.aging.openTotal).toBe(242);
  });
  it("bankkoppeling aan een gecrediteerde factuur wordt geweigerd", () => {
    const invoice = { total: 121, currency: "EUR", status: "SENT" };
    expect(bankMatchError({ direction: "CREDIT", amount: 121 }, invoice)).toBeNull();
    expect(bankMatchError({ direction: "CREDIT", amount: 121 }, { ...invoice, creditedAt: new Date() })).toMatch(/gecrediteerd/);
  });
});

describe("het origineel is pas gecrediteerd als de creditfactuur is uitgereikt (nr 7)", () => {
  function fakeTx(opts: { logTarget?: string | null; originalByNumber?: string | null } = {}) {
    return {
      invoice: {
        findFirst: vi.fn(async () => (opts.originalByNumber ? { id: opts.originalByNumber } : null)),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      auditLog: { findFirst: vi.fn(async () => (opts.logTarget ? { target: opts.logTarget } : null)) },
    };
  }
  it("met vaste verwijzing: origineel krijgt creditedAt, alleen als die nog leeg is", async () => {
    const tx = fakeTx();
    await markOriginalCredited(tx as never, "a1", { id: "c1", invoiceNumber: "2026-0012", total: -121, originalInvoiceId: "o1" });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", userId: "a1", creditedAt: null, total: { gt: 0 } }, data: { creditedAt: expect.any(Date) },
    });
    expect(tx.auditLog.findFirst).not.toHaveBeenCalled();
  });
  it("oude creditfactuur zonder verwijzing: via een logregel die niet ouder is dan de creditfactuur", async () => {
    const createdAt = new Date("2026-11-05T10:00:00Z");
    const tx = fakeTx({ logTarget: "2026-0007 → 2026-0012", originalByNumber: "o7" });
    await markOriginalCredited(tx as never, "a1", { id: "c1", invoiceNumber: "2026-0012", total: -121, originalInvoiceId: null, createdAt });
    const where = (tx.auditLog.findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ action: "invoice.credited", target: { endsWith: " → 2026-0012" }, createdAt: { gte: createdAt } });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "o7" }) }));
  });
  it("geen passende logregel (bijv. alleen een van een verwijderd concept met hetzelfde nummer): niets", async () => {
    const tx = fakeTx({ logTarget: null });
    expect(await findCreditedOriginalId(tx as never, "a1", { invoiceNumber: "2026-0012", total: -121, originalInvoiceId: null, createdAt: new Date() })).toBeNull();
    await markOriginalCredited(tx as never, "a1", { id: "c1", invoiceNumber: "2026-0012", total: -121, originalInvoiceId: null, createdAt: new Date() });
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });
  it("een gewone factuur raakt niets", async () => {
    const tx = fakeTx();
    await markOriginalCredited(tx as never, "a1", { id: "i1", invoiceNumber: "2026-0013", total: 121, originalInvoiceId: null });
    expect(tx.auditLog.findFirst).not.toHaveBeenCalled();
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });
});

describe("bestaat er al een creditfactuur? hergebruikte nummers tellen niet (nr 7)", () => {
  function fakeTx(opts: { linked?: string | null; logs?: { target: string; createdAt: Date }[]; candidates?: { invoiceNumber: string; createdAt: Date }[] }) {
    return {
      invoice: {
        findFirst: vi.fn(async () => (opts.linked ? { invoiceNumber: opts.linked } : null)),
        findMany: vi.fn(async () => opts.candidates ?? []),
      },
      auditLog: { findMany: vi.fn(async () => opts.logs ?? []) },
    };
  }
  const original = { id: "o1", invoiceNumber: "2026-0007" };
  it("vaste verwijzing gaat voor", async () => {
    const tx = fakeTx({ linked: "2026-0012" });
    expect(await findCreditNoteFor(tx as never, "a1", original, "DRAFT")).toBe("2026-0012");
    expect(tx.auditLog.findMany).not.toHaveBeenCalled();
  });
  it("logregel van een verwijderd concept, nummer later hergebruikt: telt niet", async () => {
    const tx = fakeTx({
      logs: [{ target: "2026-0007 → 2026-0012", createdAt: new Date("2026-11-01T10:00:00Z") }],
      candidates: [{ invoiceNumber: "2026-0012", createdAt: new Date("2026-11-05T10:00:00Z") }],
    });
    expect(await findCreditNoteFor(tx as never, "a1", original, { not: "CANCELED" })).toBeNull();
    const where = (tx.invoice.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ originalInvoiceId: null, total: { lt: 0 }, status: { not: "CANCELED" }, invoiceNumber: { in: ["2026-0012"] } });
  });
  it("logregel direct na de creditfactuur geschreven: telt wel", async () => {
    const tx = fakeTx({
      logs: [{ target: "2026-0007 → 2026-0012", createdAt: new Date("2026-11-05T10:00:00.020Z") }],
      candidates: [{ invoiceNumber: "2026-0012", createdAt: new Date("2026-11-05T10:00:00Z") }],
    });
    expect(await findCreditNoteFor(tx as never, "a1", original, { not: "CANCELED" })).toBe("2026-0012");
  });
  it("creditnummer uit het logdoel", () => {
    expect(creditNumberFromAuditTarget("2026-0007 → 2026-0012", "2026-0007")).toBe("2026-0012");
    expect(creditNumberFromAuditTarget("2026-00071 → 2026-0012", "2026-0007")).toBeNull();
    expect(creditNumberFromAuditTarget(null, "2026-0007")).toBeNull();
  });
});

describe("SQL voor oude gecrediteerde facturen (nr 7)", () => {
  const sql = readFileSync(join(process.cwd(), "prisma", "sql", "2026-11-18-gecrediteerd-en-betalingen.sql"), "utf8");
  const update = sql.slice(sql.indexOf("UPDATE"));
  it("telt alleen uitgereikte creditfacturen, nooit een concept", () => {
    expect(update).toContain(`c."status" IN ('SENT', 'OVERDUE', 'PAID')`);
    expect(update).not.toMatch(/c\."status" <> 'CANCELED'/);
  });
  it("het logboekpad geldt alleen zonder vaste verwijzing en alleen voor een logregel die niet ouder is dan de creditfactuur", () => {
    expect(update).toMatch(/c\."originalInvoiceId" IS NULL\s+AND EXISTS/);
    expect(update).toContain(`a."createdAt" >= c."createdAt"`);
  });
  it("blijft alleen toevoegend en herhaalbaar", () => {
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "creditedAt"`);
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "InvoicePayment"`);
    expect(update).toContain(`o."creditedAt" IS NULL`);
    expect(sql).not.toMatch(/\b(DROP|RENAME|ALTER COLUMN|DELETE FROM|TRUNCATE)\b/i);
  });
});

describe("aanbetaling verrekenen op de eindfactuur (nr 55)", () => {
  it("alleen een uitgereikte, niet gecrediteerde aanbetaling wordt afgetrokken", () => {
    expect(depositToSettle({ status: "SENT" })).toBe("settle");
    expect(depositToSettle({ status: "PAID", creditedAt: null })).toBe("settle");
    expect(depositToSettle({ status: "OVERDUE", creditedAt: new Date() })).toBe("skip");
    expect(depositToSettle({ status: "PAID", creditedAt: new Date() })).toBe("skip");
    expect(depositToSettle({ status: "CANCELED" })).toBe("skip");
    expect(depositToSettle(null)).toBe("skip");
    expect(depositToSettle({ status: "DRAFT" })).toBe("draft");
    // Een concept-creditfactuur voor de aanbetaling: eerst uitreiken of verwijderen.
    expect(depositToSettle({ status: "SENT", creditedAt: null }, true)).toBe("credit_draft");
    expect(depositToSettle({ status: "SENT", creditedAt: new Date() }, true)).toBe("skip");
  });
});

describe("Mollie: netto ontvangen over alle betalingen (nr 30)", () => {
  const paid = (amount: number, refunded = 0, chargedBack = 0) => ({ amount, refunded, chargedBack });

  it("een coulance-terugstorting van 5 euro op 500 euro laat de factuur betaald", () => {
    const before = summarizeInvoicePayments([paid(500)], 500);
    const after = summarizeInvoicePayments([paid(500, 5)], 500);
    expect(after.settled).toBe(true);
    expect(after.net).toBe(495);
    expect(after.partiallyRefunded).toBe(5);
    expect(invoicePaymentStatusChange({ status: "PAID", before, after, paidViaBank: false })).toBeNull();
  });
  it("een volledige terugstorting of een terugboeking zet de factuur weer open", () => {
    const before = summarizeInvoicePayments([paid(500)], 500);
    for (const row of [paid(500, 500), paid(500, 0, 500)]) {
      const after = summarizeInvoicePayments([row], 500);
      expect(after.settled).toBe(false);
      expect(invoicePaymentStatusChange({ status: "PAID", before, after, paidViaBank: false })).toBe("REOPEN");
    }
  });
  it("een dubbele betaling wordt gemeld, en terugstorten van één ervan laat de factuur betaald", () => {
    const twice = summarizeInvoicePayments([paid(500), paid(500)], 500);
    expect(twice.settled).toBe(true);
    expect(twice.overpaid).toBe(500);
    const oneRefunded = summarizeInvoicePayments([paid(500), paid(500, 500)], 500);
    expect(oneRefunded.settled).toBe(true);
    expect(oneRefunded.overpaid).toBe(0);
    expect(invoicePaymentStatusChange({ status: "PAID", before: twice, after: oneRefunded, paidViaBank: false })).toBeNull();
  });
  it("een eerste betaling zet een openstaande factuur op betaald", () => {
    const none = summarizeInvoicePayments([], 500);
    const after = summarizeInvoicePayments([paid(500)], 500);
    expect(invoicePaymentStatusChange({ status: "SENT", before: none, after, paidViaBank: false })).toBe("PAID");
    expect(invoicePaymentStatusChange({ status: "CANCELED", before: none, after, paidViaBank: false })).toBeNull();
  });
  it("niet openzetten als de factuur ook via de bank betaald is, of niet dankzij Mollie betaald was", () => {
    const before = summarizeInvoicePayments([paid(500)], 500);
    const after = summarizeInvoicePayments([paid(500, 500)], 500);
    expect(invoicePaymentStatusChange({ status: "PAID", before, after, paidViaBank: true })).toBeNull();
    const notSettled = summarizeInvoicePayments([paid(500, 500)], 500);
    expect(invoicePaymentStatusChange({ status: "PAID", before: notSettled, after, paidViaBank: false })).toBeNull();
    expect(invoicePaymentStatusChange({ status: "SENT", before, after, paidViaBank: false })).toBeNull();
  });
});

describe("aanbetaling op de offertepagina = bedrag van de aanbetalingsfactuur (nr 56)", () => {
  const lines = [{ vatRate: 9, lineTotal: 1000 }, { vatRate: 21, lineTotal: 1000 }];
  it("gemengde tarieven: 30% van 1.000 euro tegen 9% en 1.000 euro tegen 21% is 690 euro, niet 726", () => {
    expect(depositInvoiceTotal(lines, 30, "OFF-0001")).toBe(690);
  });
  it("is precies het totaal van de factuurregels die bij akkoord worden gemaakt", () => {
    const odd = [{ vatRate: 21, lineTotal: "333.33" }, { vatRate: 9, lineTotal: "123.45" }, { vatRate: 0, lineTotal: 10 }];
    expect(depositInvoiceTotal(odd, 25)).toBe(calculateInvoiceTotals(depositLines(odd, 25, "")).total);
  });
  it("zonder aanbetaling: 0", () => {
    expect(depositInvoiceTotal(lines, 0)).toBe(0);
  });
});

describe("aanbetalingsfactuur: wat de klant te zien krijgt (nr 54)", () => {
  it("niet uitgereikt = volgt nog; uitgereikt en gemaild = gemaild; anders klaar om te downloaden", () => {
    expect(depositDelivery(false, null)).toBe("pending");
    expect(depositDelivery(false, "sent")).toBe("pending");
    expect(depositDelivery(true, "sent")).toBe("mailed");
    for (const result of ["no_email", "email_not_configured", null, undefined]) expect(depositDelivery(true, result)).toBe("ready");
  });
});

describe("offertes bewaren (nr 40)", () => {
  it("alleen een leeg concept mag weg", () => {
    expect(isDeletableQuote({ status: "DRAFT" })).toBe(true);
    expect(quoteDeleteBlock({ status: "DRAFT" })).toBeNull();
    expect(quoteDeleteBlock({ status: "SENT" })?.code).toBe("quote_sent");
    expect(quoteDeleteBlock({ status: "DECLINED" })?.code).toBe("quote_sent");
    expect(quoteDeleteBlock({ status: "ACCEPTED", signatureName: "Piet", acceptedAt: new Date() })?.code).toBe("quote_signed");
    expect(quoteDeleteBlock({ status: "CONVERTED", convertedInvoiceId: "i1" })?.code).toBe("quote_signed");
    // Ook als de status ooit is teruggezet: een handtekening of factuur blijft tellen.
    expect(quoteDeleteBlock({ status: "DRAFT", signatureName: "Piet" })?.code).toBe("quote_signed");
    expect(quoteDeleteBlock({ status: "DRAFT", depositInvoiceId: "d1" })?.code).toBe("quote_invoiced");
  });
  it("niet terug naar concept na verzenden of tekenen, en ondertekend blijft ondertekend", () => {
    expect(quoteStatusChangeBlock({ status: "DRAFT" }, "SENT")).toBeNull();
    expect(quoteStatusChangeBlock({ status: "SENT" }, "DECLINED")).toBeNull();
    expect(quoteStatusChangeBlock({ status: "SENT" }, "DRAFT")?.code).toBe("quote_sent");
    expect(quoteStatusChangeBlock({ status: "ACCEPTED", signatureName: "Piet" }, "DRAFT")?.code).toBe("quote_signed");
    expect(quoteStatusChangeBlock({ status: "ACCEPTED", signatureName: "Piet" }, "SENT")?.code).toBe("quote_signed");
    expect(quoteStatusChangeBlock({ status: "ACCEPTED", signatureName: "Piet" }, "CONVERTED")).toBeNull();
  });
  it("klant verwijderen: bewaarde offertes blokkeren, concepten en schema's vragen om bevestiging", () => {
    const none = { keptQuotes: 0, draftQuotes: 0, schedules: 0, activeSchedules: 0 };
    expect(customerDeleteDecision(none, false)).toEqual({ ok: true });
    const kept = customerDeleteDecision({ ...none, keptQuotes: 2, draftQuotes: 1 }, true);
    expect(kept.ok).toBe(false);
    if (!kept.ok) expect(kept.code).toBe("HAS_QUOTES");
    const linked = customerDeleteDecision({ ...none, draftQuotes: 1, schedules: 2, activeSchedules: 1 }, false);
    expect(linked).toMatchObject({ ok: false, code: "CONFIRM_LINKED", draftQuotes: 1, schedules: 2, activeSchedules: 1 });
    expect(customerDeleteDecision({ ...none, draftQuotes: 1, schedules: 2, activeSchedules: 1 }, true)).toEqual({ ok: true });
  });
});

describe("uitgaven na de btw-aangifte (nr 42)", () => {
  it("uiterste aangiftedatum: laatste dag van de maand na het kwartaal", () => {
    expect(vatQuarterOf(new Date("2026-02-10T00:00:00Z"))).toMatchObject({ year: 2026, quarter: 1 });
    expect(vatQuarterOf(new Date("2026-02-10T00:00:00Z")).due.toISOString().slice(0, 10)).toBe("2026-04-30");
    expect(vatQuarterOf(new Date("2026-08-01T00:00:00Z")).due.toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(vatQuarterOf(new Date("2026-12-31T00:00:00Z")).due.toISOString().slice(0, 10)).toBe("2027-01-31");
  });
  it("dicht na de uiterste datum, nog open tot en met die dag", () => {
    const q3 = new Date("2026-09-15T00:00:00Z");
    expect(isVatPeriodClosed(q3, new Date("2026-10-31T22:00:00Z"))).toBe(false);
    expect(isVatPeriodClosed(q3, new Date("2026-11-01T08:00:00Z"))).toBe(true);
    expect(isVatPeriodClosed(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-18T00:00:00Z"))).toBe(false);
  });
  const now = new Date("2026-11-18T12:00:00Z");
  const old = { date: new Date("2026-05-12T00:00:00Z"), vendor: "Coolblue", amountGross: 121, vatRate: 21, receipt: "data:image/png;base64,AAAA" };
  it("verwijderen uit een aangegeven kwartaal kan niet, uit het huidige kwartaal wel", () => {
    expect(expenseDeleteBlock(old, now)).toMatchObject({ code: "vat_period_closed", quarter: 2, year: 2026 });
    expect(expenseDeleteBlock({ date: new Date("2026-11-03T00:00:00Z") }, now)).toBeNull();
  });
  it("bewerken: omschrijving en categorie mogen, bedrag, btw, datum, leverancier en bonnetje niet", () => {
    expect(expenseEditBlock(old, {}, now)).toBeNull();
    expect(expenseEditBlock(old, { amountGross: 121, vatRate: 21, vendor: "Coolblue", date: old.date, receipt: undefined }, now)).toBeNull();
    expect(expenseEditBlock(old, { amountGross: 100 }, now)?.code).toBe("vat_period_closed");
    expect(expenseEditBlock(old, { vatRate: 9 }, now)).not.toBeNull();
    expect(expenseEditBlock(old, { vendor: "Bol" }, now)).not.toBeNull();
    expect(expenseEditBlock(old, { date: new Date("2026-11-01T00:00:00Z") }, now)).not.toBeNull();
    expect(expenseEditBlock(old, { receipt: null }, now)).not.toBeNull();
    expect(expenseEditBlock(old, { receipt: "data:image/png;base64,BBBB" }, now)).not.toBeNull();
  });
  it("een ontbrekend bonnetje mag er nog bij, en niets mag naar een dicht kwartaal verhuizen", () => {
    expect(expenseEditBlock({ ...old, receipt: null }, { receipt: "data:image/png;base64,BBBB" }, now)).toBeNull();
    const current = { ...old, date: new Date("2026-11-03T00:00:00Z") };
    expect(expenseEditBlock(current, { amountGross: 50 }, now)).toBeNull();
    expect(expenseEditBlock(current, { date: new Date("2026-06-30T00:00:00Z") }, now)?.message).toMatch(/verplaatst/);
  });
  it("het logboek bewaart datum, leverancier, bedrag en btw", () => {
    const target = expenseLogTarget({ id: "e1", date: old.date, vendor: "Coolblue", amountGross: "121.00", vatAmount: "21.00", vatRate: "21", receipt: old.receipt });
    expect(target).toBe("2026-05-12 · Coolblue · € 121,00 incl. € 21,00 btw (21%) · met bonnetje · e1");
  });
});
