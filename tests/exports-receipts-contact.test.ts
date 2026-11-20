import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Routetests met een nep-database voor het pakket "Auditfile, boekhouder-export,
 * CSV en uitgavenlijst" (nr 8, 13, 36, 44, 45, 59) en het contactformulier.
 * Geen echte database of Next-server nodig.
 */

type Fn = ReturnType<typeof vi.fn>;
const h = vi.hoisted(() => {
  const session: { user: Record<string, unknown> | null } = { user: null };
  const tx: Record<string, Record<string, Fn>> = {};
  const db: Record<string, unknown> = {
    $transaction: vi.fn(async (work: (t: unknown) => unknown) => work(tx)),
  };
  return { session, tx, db, logAccount: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/auth", () => ({ auth: async () => (h.session.user ? { user: h.session.user } : null) }));
vi.mock("@/lib/audit", () => ({ logAccount: h.logAccount, logPlatform: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ decrypt: (v: string | null | undefined) => v ?? null, encrypt: (v: string) => v }));

import { GET as auditfileExport } from "@/app/api/exports/auditfile/route";
import { GET as accountantExport } from "@/app/api/exports/accountant/route";
import { GET as listExpenses } from "@/app/api/expenses/route";
import { GET as expenseReceipt } from "@/app/api/expenses/[id]/receipt/route";
import { PATCH as patchExpense } from "@/app/api/expenses/[id]/route";
import { PATCH as patchInvoice } from "@/app/api/invoices/[id]/route";
import { PATCH as bankAction } from "@/app/api/bank/transactions/[id]/route";
import { POST as contact } from "@/app/api/contact/route";
import { csvAmount, csvCell, csvRow, neutralizeCsvText, toCsv } from "@/lib/csv-safe";
import { receiptFileFromDataUrl } from "@/lib/receipt-file";
import { paidAtUpdate } from "@/lib/invoice-status";
import { paidAtForBankMatch } from "@/lib/bank-matching";

const OWNER = { id: "a1", accountId: "a1", role: "USER", name: "Jan", email: "jan@example.nl" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function reset() {
  for (const key of Object.keys(h.tx)) delete h.tx[key];
  for (const key of Object.keys(h.db)) if (key !== "$transaction") delete h.db[key];
  const model = () => ({
    findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []),
    update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })), create: vi.fn(async () => ({})),
    count: vi.fn(async () => 0),
  });
  for (const name of ["invoice", "auditLog", "bankTransaction", "customer", "company", "expense", "inboxItem", "contactMessage", "invoiceSettings", "timeEntry", "quote"]) {
    h.tx[name] = model();
    h.db[name] = h.tx[name];
  }
  h.session.user = { ...OWNER };
  h.logAccount.mockReset();
}
beforeEach(reset);

const invoiceRow = (o: Record<string, unknown> = {}) => ({
  id: "i1", invoiceNumber: "2026-0001", issueDate: new Date("2026-03-01T00:00:00Z"), status: "SENT",
  subtotal: 100, vatAmount: 21, total: 121, currency: "EUR", vatScheme: null, paidAt: null, updatedAt: new Date("2026-03-01T00:00:00Z"),
  customer: { id: "c1", name: "Klant BV" }, lineItems: [{ lineTotal: 100, vatRate: 21 }], ...o,
});

describe("auditfile-route (nr 8, 44, 59)", () => {
  it("vraagt alleen uitgereikte facturen op, en uitgaven zonder bonnetje", async () => {
    await auditfileExport(new Request("http://localhost/api/exports/auditfile?year=2026&format=csv"));
    const invoiceQuery = (h.db.invoice as Record<string, Fn>).findMany.mock.calls[0][0] as { where: { status: { in: string[] } } };
    expect(invoiceQuery.where.status.in.sort()).toEqual(["OVERDUE", "PAID", "SENT"]);
    const expenseQuery = (h.db.expense as Record<string, Fn>).findMany.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(expenseQuery.select).toBeDefined();
    expect(expenseQuery.select.receipt).toBeUndefined();
  });

  it("boekt een ontvangst in januari van een decemberfactuur, op de datum van de bankontvangst", async () => {
    const invoice = h.db.invoice as Record<string, Fn>;
    invoice.findMany.mockImplementation(async (args: { where: { status: unknown } }) =>
      args.where.status === "CANCELED"
        ? []
        : [invoiceRow({ issueDate: new Date("2025-12-20T00:00:00Z"), status: "PAID", updatedAt: new Date("2026-02-01T00:00:00Z") })]);
    (h.db.bankTransaction as Record<string, Fn>).findMany.mockResolvedValue([{ matchedInvoiceId: "i1", date: new Date("2026-01-08T00:00:00Z") }]);
    const res = await auditfileExport(new Request("http://localhost/api/exports/auditfile?year=2026&format=csv"));
    const csv = await res.text();
    expect(csv).toContain('"2026-01-08";"BNK";"2026-0001";"1100"');
    expect(csv).not.toContain('"VRK"');
  });

  // Review nr 44: een ontvangst uit een eerder jaar alleen op paidAt, nooit op updatedAt.
  it("facturen uit een eerder jaar: alleen open op 1 januari of betaald (paidAt) in dit jaar; nooit op updatedAt", async () => {
    await auditfileExport(new Request("http://localhost/api/exports/auditfile?year=2026&format=xaf"));
    const query = (h.db.invoice as Record<string, Fn>).findMany.mock.calls[0][0] as { where: { OR: unknown[] } };
    expect(JSON.stringify(query.where)).not.toContain("updatedAt");
    expect(query.where.OR[1]).toEqual({
      issueDate: { lt: new Date("2026-01-01T00:00:00Z") },
      OR: [{ status: { in: ["SENT", "OVERDUE"] } }, { status: "PAID", paidAt: { gte: new Date("2026-01-01T00:00:00Z") } }],
    });
  });

  it("XAF: een decemberfactuur die in januari betaald is, staat in de beginbalans van debiteuren", async () => {
    const invoice = h.db.invoice as Record<string, Fn>;
    invoice.findMany.mockImplementation(async (args: { where: { status: unknown } }) =>
      args.where.status === "CANCELED"
        ? []
        : [invoiceRow({ issueDate: new Date("2025-12-20T00:00:00Z"), status: "PAID", paidAt: new Date("2026-01-08T00:00:00Z") })]);
    const res = await auditfileExport(new Request("http://localhost/api/exports/auditfile?year=2026&format=xaf"));
    const xml = await res.text();
    expect(xml).toMatch(/<obLine>\s*<nr>1<\/nr>\s*<accID>1300<\/accID>\s*<amnt>121\.00<\/amnt>\s*<amntTp>D<\/amntTp>/);
    expect(xml).toMatch(/<trDt>2026-01-08<\/trDt>/);
    expect(xml).not.toContain("<jrnID>VRK</jrnID>");
  });

  it("check-formaat meldt vervallen nummers en facturen in een andere valuta", async () => {
    const invoice = h.db.invoice as Record<string, Fn>;
    invoice.findMany.mockImplementation(async (args: { where: { status: unknown } }) =>
      args.where.status === "CANCELED"
        ? [{ invoiceNumber: "2026-0003", status: "CANCELED", currency: "EUR" }]
        : [invoiceRow({ currency: "USD" })]);
    const res = await auditfileExport(new Request("http://localhost/api/exports/auditfile?year=2026&format=check"));
    expect(await res.json()).toEqual({ year: 2026, canceled: ["2026-0003"], foreignCurrency: [{ invoiceNumber: "2026-0001", currency: "USD" }] });
    expect((h.db.expense as Record<string, Fn>).findMany).not.toHaveBeenCalled();
  });
});

describe("boekhouder-export (nr 8, 36, 59)", () => {
  it("geen vervallen concepten als omzet; wel als nummer zonder bedrag; tekst veilig; geen bonnetjes", async () => {
    const invoice = h.db.invoice as Record<string, Fn>;
    invoice.findMany.mockImplementation(async (args: { where: { status: unknown } }) =>
      args.where.status === "CANCELED"
        ? [{ invoiceNumber: "2026-0002", issueDate: new Date("2026-02-01T00:00:00Z") }]
        : [invoiceRow({ customer: { name: "=HYPERLINK(\"x\")" }, subtotal: -100, vatAmount: -21, total: -121 })]);
    const res = await accountantExport(new Request("http://localhost/api/exports/accountant?year=2026"));
    const csv = await res.text();
    const query = invoice.findMany.mock.calls[0][0] as { where: { status: { in: string[] } } };
    expect(query.where.status.in.sort()).toEqual(["OVERDUE", "PAID", "SENT"]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"-100,00";"-21,00";"-121,00"');
    expect(csv).toMatch(/"Vervallen nummer";"2026-02-01";"2026-0002";"[^"]+";"";"";""/);
    const expenseQuery = (h.db.expense as Record<string, Fn>).findMany.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(expenseQuery.select.receipt).toBeUndefined();
  });
});

describe("uitgavenlijst en bonnetjes (nr 13)", () => {
  it("de lijst stuurt geen bonnetjes mee, alleen of er een is en waar", async () => {
    const expense = h.db.expense as Record<string, Fn>;
    expense.findMany.mockImplementation(async (args: { where: { receipt?: unknown } }) =>
      args.where.receipt
        ? [{ id: "e1" }]
        : [
            { id: "e1", date: new Date("2026-03-01T00:00:00Z"), vendor: "Coolblue", description: null, category: "OTHER", amountGross: 121, vatRate: 21, vatAmount: 21 },
            { id: "e2", date: new Date("2026-03-02T00:00:00Z"), vendor: "Bol", description: null, category: "OTHER", amountGross: 10, vatRate: 21, vatAmount: 1.74 },
          ]);
    const res = await listExpenses(new Request("http://localhost/api/expenses?year=2026"));
    const rows = (await res.json()) as Record<string, unknown>[];
    const listQuery = expense.findMany.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(listQuery.select.receipt).toBeUndefined();
    expect(rows.every((r) => !("receipt" in r))).toBe(true);
    expect(rows.map((r) => [r.id, r.hasReceipt, r.receiptUrl])).toEqual([["e1", true, "/api/expenses/e1/receipt"], ["e2", false, null]]);
  });

  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0]);
  const PDF = Buffer.from("%PDF-1.4 test");

  it("bonnetje per uitgave met veilige headers; foto inline, pdf als download", async () => {
    const expense = h.db.expense as Record<string, Fn>;
    expense.findFirst.mockResolvedValue({ id: "expense0001", receipt: `data:image/png;base64,${PNG.toString("base64")}` });
    const res = await expenseReceipt(new Request("http://localhost"), params("expense0001"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline;/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
    expect(expense.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "expense0001", userId: "a1" } }));

    expense.findFirst.mockResolvedValue({ id: "expense0001", receipt: `data:application/pdf;base64,${PDF.toString("base64")}` });
    const pdf = await expenseReceipt(new Request("http://localhost"), params("expense0001"));
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toMatch(/^attachment;/);
  });

  it("bewerken zonder bonnetje mee te sturen laat het bestaande bonnetje staan", async () => {
    const expense = h.db.expense as Record<string, Fn>;
    const today = new Date();
    expense.findFirst.mockResolvedValue({ id: "e1", date: today, vendor: "Coolblue", amountGross: 121, vatRate: 21, vatAmount: 21, receipt: "data:image/png;base64,AAAA" });
    const res = await patchExpense(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ description: "Laptoptas" }) }), params("e1"));
    expect(res.status).toBe(200);
    const data = (expense.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("receipt");
    expect(data.description).toBe("Laptoptas");
  });

  it("geen bonnetje of een andere eigenaar: 404", async () => {
    const res = await expenseReceipt(new Request("http://localhost"), params("x"));
    expect(res.status).toBe(404);
  });

  it("het type komt uit de bytes, niet uit de data-URL", () => {
    const fake = receiptFileFromDataUrl(`data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`);
    expect(fake?.mime).toBe("application/octet-stream");
    expect(fake?.inline).toBe(false);
    expect(receiptFileFromDataUrl("geen data-url")).toBeNull();
  });
});

describe("betaaldatum (nr 44)", () => {
  it("paidAtUpdate: naar betaald zet de datum, weer open wist hem", () => {
    const when = new Date("2026-05-01T00:00:00Z");
    expect(paidAtUpdate("SENT", "PAID", when)).toEqual({ paidAt: when });
    expect(paidAtUpdate("PAID", "OVERDUE")).toEqual({ paidAt: null });
    expect(paidAtUpdate("SENT", "OVERDUE")).toEqual({});
    expect(paidAtUpdate("PAID", "PAID")).toEqual({});
  });

  it("handmatig op betaald zetten legt de betaaldatum vast; terugzetten wist hem", async () => {
    const invoice = h.tx.invoice;
    invoice.findFirst.mockResolvedValue({ id: "i1", status: "SENT", invoiceNumber: "2026-0001" });
    await patchInvoice(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "PAID" }) }), params("i1"));
    expect(invoice.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "PAID", paidAt: expect.any(Date) } });

    invoice.update.mockClear();
    invoice.findFirst.mockResolvedValue({ id: "i1", status: "PAID", invoiceNumber: "2026-0001" });
    await patchInvoice(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "SENT" }) }), params("i1"));
    expect(invoice.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "SENT", paidAt: null } });
  });

  it("koppelen aan een bankontvangst: betaaldatum = datum van de ontvangst", async () => {
    h.tx.bankTransaction.findFirst.mockImplementation(async (args: { where: { id?: string } }) =>
      args.where.id === "t1" ? { id: "t1", status: "UNMATCHED", direction: "CREDIT", amount: 121, date: new Date("2026-04-03T00:00:00Z"), suggestedInvoiceId: null, matchedInvoiceId: null } : null);
    h.tx.invoice.findFirst.mockResolvedValue({ id: "i1", status: "SENT", total: 121, currency: "EUR", creditedAt: null, paidAt: null });
    const res = await bankAction(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "confirm", invoiceId: "i1" }) }), params("t1"));
    expect(res.status).toBe(200);
    expect(h.tx.invoice.update).toHaveBeenCalledWith({ where: { id: "i1", userId: "a1" }, data: { status: "PAID", paidAt: new Date("2026-04-03T00:00:00Z") } });
  });

  // Review nr 44: bij "handmatig op betaald" wint de bankdatum van de klikdatum.
  const bankRow = { id: "t1", status: "UNMATCHED", direction: "CREDIT", amount: 121, date: new Date("2026-12-30T00:00:00Z"), suggestedInvoiceId: null, matchedInvoiceId: null };
  it("handmatig op betaald en daarna gekoppeld: de bankdatum wordt de betaaldatum", async () => {
    h.tx.bankTransaction.findFirst.mockImplementation(async (args: { where: { id?: string } }) => (args.where.id === "t1" ? bankRow : null));
    h.tx.invoice.findFirst.mockResolvedValue({ id: "i1", invoiceNumber: "2026-0001", status: "PAID", total: 121, currency: "EUR", creditedAt: null, paidAt: new Date("2027-01-03T00:00:00Z") });
    h.tx.auditLog.findMany.mockResolvedValue([]);
    const res = await bankAction(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "confirm", invoiceId: "i1" }) }), params("t1"));
    expect(res.status).toBe(200);
    expect(h.tx.invoice.update).toHaveBeenCalledWith({ where: { id: "i1", userId: "a1" }, data: { status: "PAID", paidAt: new Date("2026-12-30T00:00:00Z") } });
  });

  it("online betaald (Mollie) en daarna gekoppeld: de Mollie-datum blijft staan", async () => {
    h.tx.bankTransaction.findFirst.mockImplementation(async (args: { where: { id?: string } }) => (args.where.id === "t1" ? bankRow : null));
    const mollieDate = new Date("2026-12-27T10:00:00Z");
    h.tx.invoice.findFirst.mockResolvedValue({ id: "i1", invoiceNumber: "2026-0001", status: "PAID", total: 121, currency: "EUR", creditedAt: null, paidAt: mollieDate });
    h.tx.auditLog.findMany.mockResolvedValue([{ action: "invoice.payment_received", createdAt: mollieDate }]);
    await bankAction(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "confirm", invoiceId: "i1" }) }), params("t1"));
    expect(h.tx.invoice.update).toHaveBeenCalledWith({ where: { id: "i1", userId: "a1" }, data: { status: "PAID", paidAt: mollieDate } });
    expect(h.tx.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ actorName: "Mollie", target: "2026-0001" }) }));
  });

  it("paidAtForBankMatch: bankdatum, behalve bij een online betaalde factuur", () => {
    const bank = new Date("2026-12-30T00:00:00Z");
    const clicked = new Date("2027-01-03T00:00:00Z");
    expect(paidAtForBankMatch({ status: "PAID", paidAt: clicked }, bank, false)).toBe(bank);
    expect(paidAtForBankMatch({ status: "PAID", paidAt: clicked }, bank, true)).toBe(clicked);
    expect(paidAtForBankMatch({ status: "SENT", paidAt: null }, bank, true)).toBe(bank);
    expect(paidAtForBankMatch({ status: "PAID", paidAt: null }, bank, true)).toBe(bank);
  });
});

describe("csv-safe (nr 36)", () => {
  it("neutraliseert ook een regeleinde aan het begin, zoals het commentaar zegt", () => {
    expect(neutralizeCsvText("\n=1+1")).toBe("'\n=1+1");
    expect(neutralizeCsvText("\r=1+1")).toBe("'\r=1+1");
  });
  it("bedragen krijgen geen apostrof, tekst die zich als bedrag voordoet wel", () => {
    expect(csvCell("-12,50", "amount")).toBe('"-12,50"');
    expect(csvCell("-2+3", "amount")).toBe(`"'-2+3"`);
    expect(csvRow(["=cmd", csvAmount("-5.00"), -3, null])).toBe(`"'=cmd";"-5.00";"-3";""`);
  });
  it("toCsv: BOM, puntkomma, CRLF", () => {
    const csv = toCsv([["Naam", "Bedrag"], ["@Klant", csvAmount("1,00")]]);
    expect(csv).toBe(`﻿"Naam";"Bedrag"\r\n"'@Klant";"1,00"`);
  });
});

describe("contactformulier", () => {
  const post = (body: string | undefined, ip = "10.0.0.1") =>
    contact(new Request("http://localhost/api/contact", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, ...(body !== undefined ? { body } : {}) }));

  it("lege body: 400 met een nette melding", async () => {
    const res = await post(undefined, "10.0.0.2");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/niet lezen/);
  });
  it("ongeldige JSON: 400", async () => {
    const res = await post("{kapot", "10.0.0.3");
    expect(res.status).toBe(400);
    expect((h.db.contactMessage as Record<string, Fn>).create).not.toHaveBeenCalled();
  });
  it("geldige JSON met verkeerde velden: 422 zoals voorheen", async () => {
    const res = await post(JSON.stringify({ name: "" }), "10.0.0.4");
    expect(res.status).toBe(422);
  });
});
