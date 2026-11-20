import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Routetests met een nep-database voor het pakket "Creditnota's, status,
 * betalingen en offertes" (nr 7, 30, 40, 42, 54, 55). Geen echte database,
 * Mollie of Next-server nodig.
 */

type Fn = ReturnType<typeof vi.fn>;
const h = vi.hoisted(() => {
  const session: { user: Record<string, unknown> | null } = { user: null };
  const tx: Record<string, Record<string, Fn>> = {};
  const db: Record<string, unknown> = {
    $transaction: vi.fn(async (work: (t: unknown) => unknown) => work(tx)),
  };
  return {
    session, tx, db,
    getPayment: vi.fn(),
    createInvoice: vi.fn(),
    sendInvoiceEmail: vi.fn(async () => "sent"),
    prepareIssue: vi.fn(async () => ({ snapshot: { frozen: true }, problem: null as string | null })),
    missingSender: vi.fn(() => [] as string[]),
    logAccount: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/auth", () => ({ auth: async () => (h.session.user ? { user: h.session.user } : null) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, string>) => `${key}:${values?.number ?? ""}`,
}));
vi.mock("@/lib/invoice-settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/invoice-settings")>()),
  getOrCreateInvoiceSettings: async () => ({}),
}));
vi.mock("@/lib/invoice-write", async (orig) => ({
  ...(await orig<typeof import("@/lib/invoice-write")>()),
  createInvoiceInTransaction: h.createInvoice,
}));
vi.mock("@/lib/mollie", () => ({
  mollie: () => ({ payments: { get: h.getPayment } }),
  activateRecurringSubscription: vi.fn(),
  invoicePaymentsEnabled: () => false,
  createInvoicePayment: vi.fn(async () => null),
}));
vi.mock("@/lib/invoice-send", () => ({ sendInvoiceEmail: h.sendInvoiceEmail }));
vi.mock("@/lib/invoice-snapshot", async (orig) => ({
  ...(await orig<typeof import("@/lib/invoice-snapshot")>()),
  prepareIssue: h.prepareIssue,
}));
vi.mock("@/lib/invoice-sender", async (orig) => ({
  ...(await orig<typeof import("@/lib/invoice-sender")>()),
  missingSenderFields: h.missingSender,
}));
vi.mock("@/lib/invoice-access", () => ({ invoicePdfLink: () => "https://example.test/pdf?token=x" }));
vi.mock("@/lib/audit", () => ({ logAccount: h.logAccount, logPlatform: vi.fn() }));
vi.mock("@/lib/reminders", () => ({ sendInvoiceReminder: vi.fn(async () => {}) }));
vi.mock("@/lib/recurring", () => ({ runDueRecurringInvoices: vi.fn(async () => ({ created: 0, sent: 0, failed: 0, skipped: 0 })) }));
vi.mock("@/lib/trial-emails", () => ({ runTrialReminders: vi.fn(async () => ({ scanned: 0, sent: 0, failed: 0 })) }));

import { POST as creditInvoice } from "@/app/api/invoices/[id]/credit/route";
import { DELETE as deleteInvoice, PATCH as patchInvoice } from "@/app/api/invoices/[id]/route";
import { POST as remindInvoice } from "@/app/api/invoices/[id]/reminder/route";
import { GET as runCron } from "@/app/api/cron/send-reminders/route";
import { POST as mollieWebhook } from "@/app/api/webhooks/mollie/route";
import { POST as convertQuote } from "@/app/api/quotes/[id]/convert/route";
import { DELETE as deleteQuote, PATCH as patchQuote } from "@/app/api/quotes/[id]/route";
import { DELETE as deleteCustomer } from "@/app/api/customers/[id]/route";
import { DELETE as deleteExpense, PATCH as patchExpense } from "@/app/api/expenses/[id]/route";
import { POST as respondQuote } from "@/app/api/public/quotes/[token]/respond/route";

const OWNER = { id: "a1", accountId: "a1", role: "USER", name: "Jan", email: "jan@example.nl" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown, url = "http://localhost/api") =>
  new Request(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

function reset() {
  for (const key of Object.keys(h.tx)) delete h.tx[key];
  for (const key of Object.keys(h.db)) if (key !== "$transaction") delete h.db[key];
  const model = () => ({
    findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []),
    update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })), create: vi.fn(async () => ({})),
    upsert: vi.fn(async () => ({})), count: vi.fn(async () => 0), delete: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 1 })),
  });
  for (const name of ["invoice", "auditLog", "invoicePayment", "bankTransaction", "quote", "quoteLineItem", "customer", "recurringInvoice", "invoiceSettings", "timeEntry", "company", "expense", "inboxItem"]) {
    h.tx[name] = model();
    h.db[name] = h.tx[name];
  }
  h.session.user = { ...OWNER };
  h.createInvoice.mockReset();
  h.sendInvoiceEmail.mockReset().mockResolvedValue("sent");
  h.prepareIssue.mockReset().mockResolvedValue({ snapshot: { frozen: true }, problem: null });
  h.missingSender.mockReset().mockReturnValue([]);
  h.logAccount.mockReset();
  h.getPayment.mockReset();
}
beforeEach(reset);

describe("creditfactuur zet het origineel op gecrediteerd (nr 7)", () => {
  const originalRow = { id: "o1", invoiceNumber: "2026-0007", status: "OVERDUE", total: 121, customerId: "k1", currency: "EUR", notes: null, issueDate: new Date("2026-10-01"), deliveryDate: null, deliveryEndDate: null, vatScheme: null, lineItems: [] };

  it("een concept-creditfactuur zet het origineel nog NIET op gecrediteerd", async () => {
    h.tx.invoice.findFirst
      .mockResolvedValueOnce({ id: "o1", user: { locale: "nl" } })
      .mockResolvedValueOnce(originalRow);
    h.createInvoice.mockResolvedValue({ id: "c1", invoiceNumber: "2026-0012" });
    const res = await creditInvoice(req("POST"), params("o1"));
    expect(res.status).toBe(201);
    expect(h.tx.invoice.update).not.toHaveBeenCalled();
    expect(h.tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "invoice.credited", target: "2026-0007 → 2026-0012" }) });
    // Origineel zonder leverdatum: de levering was op de factuurdatum van het
    // origineel, niet op de datum van de creditfactuur.
    expect(h.createInvoice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryDate: new Date("2026-10-01"), deliveryEndDate: null }));
  });

  it("de creditfactuur uitreiken (concept naar verzonden) zet het origineel op gecrediteerd, in dezelfde transactie", async () => {
    h.tx.invoice.findFirst.mockResolvedValueOnce({ id: "c1", invoiceNumber: "2026-0012", status: "DRAFT", total: -121, originalInvoiceId: "o1", createdAt: new Date() });
    const res = await patchInvoice(req("PATCH", { status: "SENT" }), params("c1"));
    expect(res.status).toBe(200);
    expect(h.tx.invoice.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "SENT", snapshot: { frozen: true } } });
    expect(h.tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", userId: "a1", creditedAt: null, total: { gt: 0 } }, data: { creditedAt: expect.any(Date) },
    });
  });

  it("een gewone factuur uitreiken raakt geen andere factuur", async () => {
    h.tx.invoice.findFirst.mockResolvedValueOnce({ id: "i1", invoiceNumber: "2026-0013", status: "DRAFT", total: 121, originalInvoiceId: null, createdAt: new Date() });
    const res = await patchInvoice(req("PATCH", { status: "SENT" }), params("i1"));
    expect(res.status).toBe(200);
    expect(h.tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(h.tx.auditLog.findFirst).not.toHaveBeenCalled();
  });

  it("een concept-creditfactuur verwijderen laat het origineel zoals het was", async () => {
    h.tx.invoiceSettings.findUnique.mockResolvedValue({ invoicePrefix: "2026-", nextNumber: 13, numberPadding: 4 });
    h.tx.invoice.findFirst.mockResolvedValueOnce({ id: "c1", invoiceNumber: "2026-0012", status: "DRAFT", total: -121, originalInvoiceId: "o1", notes: null });
    const res = await deleteInvoice(req("DELETE"), params("c1"));
    expect(res.status).toBe(200);
    expect(h.tx.invoice.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    const touched = h.tx.invoice.updateMany.mock.calls.map((c) => (c[0] as { where: { id?: string } }).where.id);
    expect(touched).not.toContain("o1");
  });

  it("een hergebruikt creditnummer van een verwijderd concept blokkeert geen nieuwe creditfactuur", async () => {
    // Logregel "2026-0007 → 2026-0012" is van een verwijderd concept; nummer
    // 2026-0012 is daarna opnieuw gebruikt voor de creditfactuur van een ANDERE factuur.
    h.tx.invoice.findFirst
      .mockResolvedValueOnce({ id: "o1", user: { locale: "nl" } })
      .mockResolvedValueOnce(originalRow);
    h.tx.auditLog.findMany.mockResolvedValueOnce([{ target: "2026-0007 → 2026-0012", createdAt: new Date("2026-11-01T10:00:00Z") }]);
    h.tx.invoice.findMany.mockResolvedValueOnce([{ invoiceNumber: "2026-0012", createdAt: new Date("2026-11-05T10:00:00Z") }]);
    h.createInvoice.mockResolvedValue({ id: "c2", invoiceNumber: "2026-0013" });
    const res = await creditInvoice(req("POST"), params("o1"));
    expect(res.status).toBe(201);
  });

  it("een oude creditfactuur (via het logboek) die nog bestaat, blokkeert wel", async () => {
    h.tx.invoice.findFirst
      .mockResolvedValueOnce({ id: "o1", user: { locale: "nl" } })
      .mockResolvedValueOnce(originalRow);
    h.tx.auditLog.findMany.mockResolvedValueOnce([{ target: "2026-0007 → 2026-0012", createdAt: new Date("2026-11-01T10:00:00.050Z") }]);
    h.tx.invoice.findMany.mockResolvedValueOnce([{ invoiceNumber: "2026-0012", createdAt: new Date("2026-11-01T10:00:00Z") }]);
    const res = await creditInvoice(req("POST"), params("o1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/2026-0012/);
    expect(h.createInvoice).not.toHaveBeenCalled();
  });

  it("geen handmatige herinnering voor een gecrediteerde factuur", async () => {
    h.tx.invoice.findFirst.mockResolvedValue({
      id: "o1", status: "OVERDUE", total: 121, creditedAt: new Date(), lastReminderAt: null, reminderCount: 0,
      customer: { name: "Klant", email: "k@example.nl" }, user: { email: "jan@example.nl", name: "Jan", company: null, invoiceSettings: null },
    });
    const res = await remindInvoice(req("POST"), params("o1"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invoice_credited");
  });

  it("de cron zet gecrediteerde facturen niet op te laat en stuurt ze geen herinneringen", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await runCron(req("GET"));
    expect(res.status).toBe(200);
    const flip = h.tx.invoice.updateMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(flip.where).toMatchObject({ status: "SENT", creditedAt: null, total: { gt: 0 } });
    const find = h.tx.invoice.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(find.where).toMatchObject({ status: "OVERDUE", creditedAt: null, total: { gt: 0 } });
    vi.unstubAllEnvs();
  });
});

describe("eindfactuur verrekent geen gecrediteerde aanbetaling (nr 55)", () => {
  const quote = { id: "q1", status: "ACCEPTED", convertedInvoiceId: null };
  const current = { ...quote, customerId: "k1", currency: "EUR", notes: null, depositInvoiceId: "d1", lineItems: [{ description: "Werk", quantity: 1, unitPrice: 1000, vatRate: 21 }] };
  it("gecrediteerde aanbetaling: geen negatieve verrekenregel", async () => {
    h.tx.quote.findFirst.mockResolvedValueOnce(quote).mockResolvedValueOnce(current);
    h.tx.invoice.findFirst.mockResolvedValue({ invoiceNumber: "2026-0003", status: "PAID", creditedAt: new Date(), lineItems: [{ vatRate: 21, lineTotal: 300 }] });
    h.createInvoice.mockResolvedValue({ id: "i9", invoiceNumber: "2026-0009" });
    const res = await convertQuote(req("POST", {}), params("q1"));
    expect(res.status).toBe(201);
    const opts = h.createInvoice.mock.calls[0][1] as { lineItems: { unitPrice: number }[] };
    expect(opts.lineItems).toHaveLength(1);
    expect(opts.lineItems.every((li) => li.unitPrice > 0)).toBe(true);
  });
  it("uitgereikte aanbetaling: wel verrekend; concept-aanbetaling: eerst versturen", async () => {
    h.tx.quote.findFirst.mockResolvedValueOnce(quote).mockResolvedValueOnce(current);
    h.tx.invoice.findFirst.mockResolvedValueOnce({ invoiceNumber: "2026-0003", status: "SENT", creditedAt: null, lineItems: [{ vatRate: 21, lineTotal: 300 }] });
    h.createInvoice.mockResolvedValue({ id: "i9", invoiceNumber: "2026-0009" });
    await convertQuote(req("POST", {}), params("q1"));
    expect((h.createInvoice.mock.calls[0][1] as { lineItems: unknown[] }).lineItems).toHaveLength(2);

    h.createInvoice.mockClear();
    h.tx.quote.findFirst.mockResolvedValueOnce(quote).mockResolvedValueOnce(current);
    h.tx.invoice.findFirst.mockResolvedValue({ invoiceNumber: "2026-0003", status: "DRAFT", creditedAt: null, lineItems: [{ vatRate: 21, lineTotal: 300 }] });
    const res = await convertQuote(req("POST", {}), params("q1"));
    expect(res.status).toBe(409);
    expect(h.createInvoice).not.toHaveBeenCalled();
  });
  it("concept-creditfactuur voor de aanbetaling: eerst uitreiken of verwijderen (409), niets gemaakt", async () => {
    h.tx.quote.findFirst.mockResolvedValueOnce(quote).mockResolvedValueOnce(current);
    h.tx.invoice.findFirst
      .mockResolvedValueOnce({ invoiceNumber: "2026-0003", status: "SENT", creditedAt: null, lineItems: [{ vatRate: 21, lineTotal: 300 }] })
      .mockResolvedValueOnce({ invoiceNumber: "2026-0011" }); // concept-creditfactuur met vaste verwijzing
    const res = await convertQuote(req("POST", {}), params("q1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/2026-0011/);
    expect(h.createInvoice).not.toHaveBeenCalled();
    const lookup = h.tx.invoice.findFirst.mock.calls[1][0] as { where: Record<string, unknown> };
    expect(lookup.where).toMatchObject({ originalInvoiceId: "d1", status: "DRAFT", total: { lt: 0 } });
  });
});

describe("Mollie-webhook telt alle betalingen (nr 30)", () => {
  const body = (id: string) => new Request("http://localhost/api/webhooks/mollie", { method: "POST", body: `id=${id}` });
  const payment = (extra: Record<string, unknown> = {}) => ({
    id: "tr_abcdef1", status: "paid", amount: { value: "500.00", currency: "EUR" }, metadata: { invoiceId: "i1" }, ...extra,
  });
  const invoice = { id: "i1", userId: "a1", invoiceNumber: "2026-0001", total: 500, currency: "EUR", status: "PAID", dueDate: new Date("2026-01-01") };

  it("5 euro coulance op 500 euro: factuur blijft betaald", async () => {
    h.getPayment.mockResolvedValue(payment({ amountRefunded: { value: "5.00", currency: "EUR" } }));
    h.tx.invoice.findUnique.mockResolvedValue(invoice);
    h.tx.invoicePayment.findMany.mockResolvedValue([{ id: "tr_abcdef1", amount: 500, refunded: 0, chargedBack: 0 }]);
    const res = await mollieWebhook(body("tr_abcdef1"));
    expect(res.status).toBe(200);
    expect(h.tx.invoice.update).not.toHaveBeenCalled();
    expect(h.tx.invoicePayment.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { amount: 500, refunded: 5, chargedBack: 0 } }));
    expect(h.tx.auditLog.create.mock.calls[0][0]).toMatchObject({ data: { action: "invoice.payment_refunded_still_paid" } });
  });

  it("terugboeking van de enige betaling: factuur weer te laat", async () => {
    h.getPayment.mockResolvedValue(payment({ amountChargedBack: { value: "500.00", currency: "EUR" } }));
    h.tx.invoice.findUnique.mockResolvedValue(invoice);
    const res = await mollieWebhook(body("tr_abcdef1"));
    expect(res.status).toBe(200);
    expect(h.tx.invoice.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "OVERDUE", paidAt: null } });
    expect(h.tx.auditLog.create.mock.calls[0][0]).toMatchObject({ data: { action: "invoice.payment_reversed" } });
  });

  it("tweede betaling: factuur blijft betaald en de dubbele betaling wordt gelogd", async () => {
    h.getPayment.mockResolvedValue(payment({ id: "tr_second1" }));
    h.tx.invoice.findUnique.mockResolvedValue(invoice);
    h.tx.invoicePayment.findMany.mockResolvedValue([{ id: "tr_abcdef1", amount: 500, refunded: 0, chargedBack: 0 }]);
    await mollieWebhook(body("tr_second1"));
    expect(h.tx.invoice.update).not.toHaveBeenCalled();
    const actions = h.tx.auditLog.create.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(actions).toEqual(["invoice.payment_received", "invoice.payment_duplicate"]);
    expect((h.tx.auditLog.create.mock.calls[1][0] as { data: { id: string } }).data.id).toMatch(/-dup$/);
  });

  it("terugstorting van 5 euro op een van twee betalingen: geen nieuwe melding voor de dubbele betaling", async () => {
    h.getPayment.mockResolvedValue(payment({ amountRefunded: { value: "5.00", currency: "EUR" } }));
    h.tx.invoice.findUnique.mockResolvedValue(invoice);
    h.tx.invoicePayment.findMany.mockResolvedValue([
      { id: "tr_abcdef1", amount: 500, refunded: 0, chargedBack: 0 },
      { id: "tr_second1", amount: 500, refunded: 0, chargedBack: 0 },
    ]);
    await mollieWebhook(body("tr_abcdef1"));
    const actions = h.tx.auditLog.create.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(actions).not.toContain("invoice.payment_duplicate");
  });

  it("betaling op een al gecrediteerde factuur: melding dat het terug moet", async () => {
    h.getPayment.mockResolvedValue(payment({ paidAt: "2026-11-10T12:00:00+00:00" }));
    h.tx.invoice.findUnique.mockResolvedValue({ ...invoice, status: "SENT", creditedAt: new Date("2026-11-05T00:00:00Z") });
    await mollieWebhook(body("tr_abcdef1"));
    const created = h.tx.auditLog.create.mock.calls.map((c) => (c[0] as { data: { action: string; target: string } }).data);
    expect(created.map((d) => d.action)).toContain("invoice.paid_after_credit");
    expect(created.find((d) => d.action === "invoice.paid_after_credit")?.target).toMatch(/500\.00 EUR/);
  });

  it("dezelfde betaling later nog eens (bijv. terugstorting): geen tweede melding", async () => {
    h.getPayment.mockResolvedValue(payment({ paidAt: "2026-11-10T12:00:00+00:00", amountRefunded: { value: "500.00", currency: "EUR" } }));
    h.tx.invoice.findUnique.mockResolvedValue({ ...invoice, creditedAt: new Date("2026-11-05T00:00:00Z") });
    h.tx.invoicePayment.findMany.mockResolvedValue([{ id: "tr_abcdef1", amount: 500, refunded: 0, chargedBack: 0 }]);
    await mollieWebhook(body("tr_abcdef1"));
    const actions = h.tx.auditLog.create.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(actions).not.toContain("invoice.paid_after_credit");
  });

  it("oude betaling (van vóór de betalingentabel) die nu wordt teruggestort: geen melding betaald-na-crediteren", async () => {
    h.getPayment.mockResolvedValue(payment({ amountRefunded: { value: "500.00", currency: "EUR" } }));
    h.tx.invoice.findUnique.mockResolvedValue({ ...invoice, creditedAt: new Date("2026-11-05T00:00:00Z") });
    await mollieWebhook(body("tr_abcdef1"));
    const actions = h.tx.auditLog.create.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(actions).not.toContain("invoice.paid_after_credit");
  });
});

describe("aanbetalingsfactuur bij akkoord (nr 54)", () => {
  const quote = { id: "q1", status: "SENT", validUntil: null, userId: "a1", createdById: "a1", customerId: "k1", quoteNumber: "OFF-0001", depositPercent: 30, currency: "EUR" };
  const sign = () => new Request("http://localhost/api/public/quotes/tok/respond", {
    method: "POST", headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200)}` },
    body: JSON.stringify({ action: "accept", signatureName: "Piet", signatureData: "data:image/png;base64,AAAA" }),
  });
  const tokenParams = { params: Promise.resolve({ token: "tok" }) };
  beforeEach(() => {
    h.tx.quote.findUnique.mockResolvedValue(quote);
    h.tx.quoteLineItem.findMany.mockResolvedValue([{ vatRate: 21, lineTotal: 1000 }]);
    h.createInvoice.mockResolvedValue({ id: "d1", invoiceNumber: "2026-0004", total: 363 });
  });

  it("ontbrekende afzendergegevens: concept blijft concept, niets gemaild, de klant ziet dat hij nog volgt", async () => {
    h.missingSender.mockReturnValue(["kvkNumber"]);
    const res = await respondQuote(sign(), tokenParams);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(h.tx.invoice.update).not.toHaveBeenCalled();
    expect(h.sendInvoiceEmail).not.toHaveBeenCalled();
    expect(data.deposit).toMatchObject({ delivery: "pending", checkoutUrl: null });
  });

  it("gegevens compleet: uitgereikt, gemaild; lukt mailen niet, dan een downloadlink", async () => {
    let res = await respondQuote(sign(), tokenParams);
    expect(h.tx.invoice.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { status: "SENT", snapshot: { frozen: true } } });
    expect((await res.json()).deposit).toMatchObject({ delivery: "mailed", pdfUrl: null });

    h.sendInvoiceEmail.mockResolvedValue("no_email");
    res = await respondQuote(sign(), tokenParams);
    expect((await res.json()).deposit).toMatchObject({ delivery: "ready", pdfUrl: "https://example.test/pdf?token=x" });
  });
});

describe("offertes en klanten bewaren (nr 40)", () => {
  it("een verstuurde of ondertekende offerte kan niet weg", async () => {
    h.tx.quote.findFirst.mockResolvedValue({ quoteNumber: "OFF-1", status: "ACCEPTED", signatureName: "Piet", acceptedAt: new Date(), depositInvoiceId: null, convertedInvoiceId: null });
    const res = await deleteQuote(req("DELETE"), params("q1"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("quote_signed");
    expect(h.tx.quote.deleteMany).not.toHaveBeenCalled();
  });
  it("een concept kan weg, alleen als het op dat moment nog een leeg concept is", async () => {
    h.tx.quote.findFirst.mockResolvedValue({ quoteNumber: "OFF-2", status: "DRAFT", signatureName: null, acceptedAt: null, depositInvoiceId: null, convertedInvoiceId: null });
    const res = await deleteQuote(req("DELETE"), params("q2"));
    expect(res.status).toBe(200);
    expect(h.tx.quote.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "q2", status: "DRAFT", signatureName: null }) });
  });
  it("een ondertekende offerte gaat niet terug naar concept", async () => {
    h.tx.quote.findFirst.mockResolvedValue({ status: "ACCEPTED", signatureName: "Piet", acceptedAt: new Date(), depositInvoiceId: null, convertedInvoiceId: null });
    const res = await patchQuote(req("PATCH", { status: "DRAFT" }), params("q1"));
    expect(res.status).toBe(409);
    expect(h.tx.quote.updateMany).not.toHaveBeenCalled();
  });
  it("klant met bewaarde offertes blijft; met alleen concepten en schema's eerst bevestigen", async () => {
    h.tx.customer.findFirst.mockResolvedValue({ id: "k1", name: "Klant" });
    h.tx.quote.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    let res = await deleteCustomer(req("DELETE"), params("k1"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("HAS_QUOTES");
    expect(h.tx.customer.deleteMany).not.toHaveBeenCalled();

    h.tx.quote.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    h.tx.recurringInvoice.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    res = await deleteCustomer(req("DELETE"), params("k1"));
    expect(await res.json()).toMatchObject({ code: "CONFIRM_LINKED", draftQuotes: 1, schedules: 1, activeSchedules: 1 });
    expect(h.tx.customer.deleteMany).not.toHaveBeenCalled();

    h.tx.quote.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    h.tx.recurringInvoice.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    res = await deleteCustomer(req("DELETE", undefined, "http://localhost/api/customers/k1?confirm=1"), params("k1"));
    expect(res.status).toBe(200);
    expect(h.tx.customer.deleteMany).toHaveBeenCalledWith({ where: { id: "k1", userId: "a1" } });
  });
});

describe("uitgaven na de btw-aangifte (nr 42)", () => {
  const closed = { id: "e1", userId: "a1", date: new Date("2025-03-10T00:00:00Z"), vendor: "Coolblue", description: null, category: "OFFICE", amountGross: 121, vatAmount: 21, vatRate: 21, receipt: "data:image/png;base64,AAAA" };
  it("verwijderen uit een aangegeven kwartaal: 409 met uitleg, niets gewist", async () => {
    h.tx.expense.findFirst.mockResolvedValue(closed);
    const res = await deleteExpense(req("DELETE"), params("e1"));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data).toMatchObject({ code: "vat_period_closed", quarter: 1, year: 2025 });
    expect(data.error).toMatch(/7 jaar/);
    expect(h.tx.expense.deleteMany).not.toHaveBeenCalled();
  });
  it("bedrag wijzigen in een aangegeven kwartaal kan niet; de omschrijving wel", async () => {
    h.tx.expense.findFirst.mockResolvedValue(closed);
    let res = await patchExpense(req("PATCH", { amountGross: 100 }), params("e1"));
    expect(res.status).toBe(409);
    expect(h.tx.expense.update).not.toHaveBeenCalled();
    res = await patchExpense(req("PATCH", { description: "Muis" }), params("e1"));
    expect(res.status).toBe(200);
    expect(h.tx.expense.update).toHaveBeenCalled();
  });
  it("verwijderen uit een open kwartaal mag, en het logboek krijgt datum, leverancier en bedrag", async () => {
    const open = { ...closed, date: new Date() };
    h.tx.expense.findFirst.mockResolvedValue(open);
    const res = await deleteExpense(req("DELETE"), params("e1"));
    expect(res.status).toBe(200);
    expect(h.logAccount).toHaveBeenCalledWith("a1", expect.anything(), "expense.deleted", expect.stringContaining("Coolblue · € 121,00"));
  });
});
