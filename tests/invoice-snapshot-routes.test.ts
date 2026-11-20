import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Routetests met een nep-database voor de momentopname (nr 10), de
 * betaalgegevens (nr 6), de KOR-grens (nr 19) en de creditfactuur (nr 9/10).
 * Geen echte database of Next-server nodig.
 */

const h = vi.hoisted(() => {
  const session: { user: Record<string, unknown> | null } = { user: null };
  const tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  const db: Record<string, unknown> = {
    $transaction: vi.fn(async (work: (t: unknown) => unknown) => work(tx)),
  };
  return {
    session, tx, db,
    after: vi.fn(),
    mail: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/auth", () => ({ auth: async () => (h.session.user ? { user: h.session.user } : null) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: h.after }));
vi.mock("@/lib/invoice-settings-emails", () => ({ sendPaymentDetailsChangedEmail: h.mail }));
vi.mock("@/lib/invoice-settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/invoice-settings")>()),
  getOrCreateInvoiceSettings: async () => ({}),
}));
vi.mock("@/lib/email", () => ({ sendEmail: h.sendEmail, emailConfigured: () => true }));
vi.mock("@/lib/mollie", () => ({ invoicePaymentsEnabled: () => false, createInvoicePayment: async () => null }));
vi.mock("@/lib/invoice-access", () => ({ invoicePdfLink: () => "https://example.test/pdf" }));
vi.mock("@/lib/invoice-sender", () => ({ missingSenderFields: () => [] }));

import { PATCH as patchSettings } from "@/app/api/invoice-settings/route";
import { PATCH as patchInvoice } from "@/app/api/invoices/[id]/route";
import { sendInvoiceEmail } from "@/lib/invoice-send";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { buildInvoiceSnapshot, creditIssueSnapshot, parseInvoiceSnapshot, prepareIssue, reminderPaymentTerms } from "@/lib/invoice-snapshot";
import { korIssuedYearRevenue, korYearRevenue } from "@/lib/kor";

const OWNER = { id: "a1", accountId: "a1", role: "USER", name: "Jan", email: "jan@example.nl" };
const ACCOUNTANT = { id: "u2", accountId: "a1", role: "USER", teamRole: "ACCOUNTANT", name: "Boekhouder", email: "bh@example.nl" };

const SETTINGS = {
  userId: "a1", invoicePrefix: "2026-", nextNumber: 8, numberPadding: 4,
  paymentTerms: "IBAN NL91ABNA0417164300 t.n.v. Jansen", korEnabled: false, accentColor: "#2563eb", footerText: null,
};

function resetTx() {
  for (const key of Object.keys(h.tx)) delete h.tx[key];
  Object.assign(h.tx, {
    invoiceSettings: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => ({ ...SETTINGS })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...SETTINGS, ...data })),
    },
    invoice: {
      count: vi.fn(async () => 3),
      findFirst: vi.fn(),
      update: vi.fn(async () => ({})),
      aggregate: vi.fn(async () => ({ _sum: { subtotal: 0 } })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    timeEntry: { updateMany: vi.fn(async () => ({ count: 0 })) },
    quote: { updateMany: vi.fn(async () => ({ count: 0 })) },
  });
}

const jsonReq = (body: unknown) => new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  resetTx();
  h.after.mockReset();
  h.mail.mockClear();
  h.sendEmail.mockClear();
  h.session.user = { ...OWNER };
});

// ---------------------------------------------------------------- PATCH /api/invoice-settings (nr 6)

describe("PATCH /api/invoice-settings: betaalgegevens (nr 6)", () => {
  it("een teamlid zonder eigenaarsrechten kan het IBAN niet wijzigen (403), en er wordt niets opgeslagen", async () => {
    h.session.user = { ...ACCOUNTANT };
    const res = await patchSettings(jsonReq({ paymentTerms: "IBAN NL02ABNA0123456789" }));
    expect(res.status).toBe(403);
    expect(h.tx.invoiceSettings.update).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });

  it("een teamlid mag wel andere instellingen wijzigen, ook als het IBAN ongewijzigd meekomt", async () => {
    h.session.user = { ...ACCOUNTANT };
    const res = await patchSettings(jsonReq({ paymentTerms: SETTINGS.paymentTerms, defaultDueDays: 30 }));
    expect(res.status).toBe(200);
    expect(h.after).not.toHaveBeenCalled();
  });

  it("de eigenaar: rij-lock eerst, een regel in het auditlog (IBAN afgeschermd) en de mail via after()", async () => {
    const res = await patchSettings(jsonReq({ paymentTerms: "IBAN NL02ABNA0123456789 t.n.v. Jansen" }));
    expect(res.status).toBe(200);
    // Rij-lock vóór het lezen van de huidige instellingen.
    const lockOrder = h.tx.invoiceSettings.updateMany.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(h.tx.invoiceSettings.findUniqueOrThrow.mock.invocationCallOrder[0]);
    expect(h.tx.invoiceSettings.updateMany).toHaveBeenCalledWith({ where: { userId: "a1" }, data: { nextNumber: { increment: 0 } } });
    const log = h.tx.auditLog.create.mock.calls.map((c) => (c as [{ data: { action: string; target: string } }])[0].data);
    expect(log).toEqual([expect.objectContaining({ action: "invoice_settings.payment_changed", target: "NL91 **** 4300 → NL02 **** 6789" })]);
    expect(JSON.stringify(log)).not.toContain("0417164300");
    // De mail staat ingepland met after(), zodat hij ook na het antwoord nog weggaat.
    expect(h.after).toHaveBeenCalledTimes(1);
    expect(h.mail).not.toHaveBeenCalled();
    await (h.after.mock.calls[0][0] as () => Promise<void>)();
    expect(h.mail).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "a1", before: SETTINGS.paymentTerms, after: "IBAN NL02ABNA0123456789 t.n.v. Jansen",
    }));
  });

  it("een mislukte mail laat de route niet falen", async () => {
    h.mail.mockRejectedValueOnce(new Error("smtp down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await patchSettings(jsonReq({ paymentTerms: "IBAN NL02ABNA0123456789" }));
    expect(res.status).toBe(200);
    await expect((h.after.mock.calls[0][0] as () => Promise<void>)()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("zonder wijziging van de betaalgegevens: geen auditregel en geen mail", async () => {
    const res = await patchSettings(jsonReq({ paymentTerms: SETTINGS.paymentTerms }));
    expect(res.status).toBe(200);
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- PATCH /api/invoices/:id (nr 10)

const company = { name: "Jansen Advies", address: "enc:Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht", country: "NL", vatNumber: "enc:NL001234567B01", kvkNumber: "enc:12345678" };
const customer = { name: "Klant BV", email: "klant@example.nl", address: "enc:Kade 2", postalCode: "1000 AA", city: "Amsterdam", country: "NL", vatNumber: null as string | null };

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1", userId: "a1", invoiceNumber: "2026-0007", status: "DRAFT", total: 121, subtotal: 100,
    issueDate: new Date("2026-11-18T00:00:00Z"), originalInvoiceId: null, vatScheme: null, snapshot: null as unknown,
    lineItems: [{ vatRate: 21 }], customer, customerId: "c1",
    user: { email: "jan@example.nl", name: "Jan", locale: "nl", company, invoiceSettings: { ...SETTINGS } },
    ...overrides,
  };
}

describe("PATCH /api/invoices/:id: momentopname bij het uitreiken (nr 10)", () => {
  it("concept naar verzonden schrijft een momentopname in dezelfde update als de status", async () => {
    h.tx.invoice.findFirst.mockImplementation(async () => invoiceRow());
    const res = await patchInvoice(jsonReq({ status: "SENT" }), params("inv1"));
    expect(res.status).toBe(200);
    const data = (h.tx.invoice.update.mock.calls[0] as [{ data: { status: string; snapshot?: unknown } }])[0].data;
    expect(data.status).toBe("SENT");
    const snap = parseInvoiceSnapshot(data.snapshot);
    expect(snap).not.toBeNull();
    expect(snap).toMatchObject({ paymentTerms: SETTINGS.paymentTerms, locale: "nl", seller: { name: "Jansen Advies" } });
  });

  it("verzonden naar betaald laat de momentopname staan", async () => {
    const existing = buildInvoiceSnapshot({
      userEmail: "jan@example.nl", company, customer, settings: { paymentTerms: "IBAN OUD" }, vatScheme: null,
    });
    h.tx.invoice.findFirst.mockImplementation(async () => invoiceRow({ status: "SENT", snapshot: existing }));
    const res = await patchInvoice(jsonReq({ status: "PAID" }), params("inv1"));
    expect(res.status).toBe(200);
    const data = (h.tx.invoice.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    // Alleen de status en de betaaldatum (voor de auditfile); de momentopname blijft staan.
    expect(data).toEqual({ status: "PAID", paidAt: expect.any(Date) });
  });

  it("weigert het uitreiken als de KOR-grens met deze factuur overschreden wordt (alleen uitgereikte facturen tellen)", async () => {
    h.tx.invoice.findFirst.mockImplementation(async () => invoiceRow({
      total: 1000, subtotal: 1000, lineItems: [{ vatRate: 0 }],
      user: { email: "jan@example.nl", name: "Jan", locale: "nl", company, invoiceSettings: { ...SETTINGS, korEnabled: true } },
    }));
    h.tx.invoice.aggregate.mockImplementation(async () => ({ _sum: { subtotal: 19_500 } }));
    const res = await patchInvoice(jsonReq({ status: "SENT" }), params("inv1"));
    expect(res.status).toBe(422);
    expect(h.tx.invoice.update).not.toHaveBeenCalled();
    const where = (h.tx.invoice.aggregate.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;
    expect(where.status).toEqual({ in: ["SENT", "PAID", "OVERDUE"] });
  });
});

// ---------------------------------------------------------------- sendInvoiceEmail (nr 10)

describe("sendInvoiceEmail: momentopname opslaan en niet overschrijven (nr 10)", () => {
  function sendDb(row: ReturnType<typeof invoiceRow>) {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    h.db.invoice = {
      findFirst: vi.fn(async () => row),
      updateMany,
      aggregate: vi.fn(async () => ({ _sum: { subtotal: 0 } })),
    };
    return updateMany;
  }

  it("bij een concept: mail met de betaalgegevens van nu, en de momentopname gaat mee in de update naar SENT", async () => {
    const updateMany = sendDb(invoiceRow());
    expect(await sendInvoiceEmail("inv1", "a1")).toBe("sent");
    const html = (h.sendEmail.mock.calls[0] as unknown as [{ html: string }])[0].html;
    expect(html).toContain("NL91ABNA0417164300");
    const arg = (updateMany.mock.calls[0] as unknown as [{ where: Record<string, unknown>; data: { status: string; snapshot: unknown } }])[0];
    expect(arg.where).toMatchObject({ status: "DRAFT" });
    expect(parseInvoiceSnapshot(arg.data.snapshot)?.paymentTerms).toBe(SETTINGS.paymentTerms);
  });

  it("bij een uitgereikte factuur: het IBAN uit de momentopname en geen nieuwe momentopname", async () => {
    const frozen = buildInvoiceSnapshot({
      userEmail: "jan@example.nl", company, customer, settings: { paymentTerms: "IBAN NL02ABNA0123456789" }, vatScheme: null,
    });
    const updateMany = sendDb(invoiceRow({ status: "SENT", snapshot: frozen }));
    expect(await sendInvoiceEmail("inv1", "a1")).toBe("sent");
    const html = (h.sendEmail.mock.calls[0] as unknown as [{ html: string }])[0].html;
    expect(html).toContain("NL02ABNA0123456789");
    expect(html).not.toContain("NL91ABNA0417164300");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("een concept-creditfactuur mailen: in één transactie naar SENT en het origineel op gecrediteerd", async () => {
    sendDb(invoiceRow({ total: -121, subtotal: -100, originalInvoiceId: "o1", invoiceNumber: "2026-0012" }));
    const txUpdateMany = vi.fn(async () => ({ count: 1 }));
    h.tx.invoice = { updateMany: txUpdateMany, findFirst: vi.fn(async () => null) };
    h.tx.auditLog = { findFirst: vi.fn(async () => null) };
    expect(await sendInvoiceEmail("inv1", "a1")).toBe("sent");
    const calls = txUpdateMany.mock.calls as unknown as [{ where: Record<string, unknown>; data: Record<string, unknown> }][];
    expect(calls[0][0]).toMatchObject({ where: { id: "inv1", status: "DRAFT" }, data: { status: "SENT" } });
    expect(calls[1][0]).toEqual({ where: { id: "o1", userId: "a1", creditedAt: null, total: { gt: 0 } }, data: { creditedAt: expect.any(Date) } });
  });
});

// ---------------------------------------------------------------- herinneringen (nr 10)

describe("herinneringen: betaalgegevens van de vastgezette factuur", () => {
  it("gebruikt het IBAN uit de momentopname, en de huidige bij een oude factuur", () => {
    const frozen = buildInvoiceSnapshot({ userEmail: "x@y.nl", company, customer, settings: { paymentTerms: "IBAN OUD" }, vatScheme: null });
    expect(reminderPaymentTerms(frozen, "IBAN NIEUW")).toBe("IBAN OUD");
    expect(reminderPaymentTerms(null, "IBAN NIEUW")).toBe("IBAN NIEUW");
    expect(reminderPaymentTerms(undefined, undefined)).toBeNull();
    // Momentopname zonder betaalgegevens blijft zonder (niet stil het nieuwe IBAN).
    const empty = buildInvoiceSnapshot({ userEmail: "x@y.nl", company, customer, settings: {}, vatScheme: null });
    expect(reminderPaymentTerms(empty, "IBAN NIEUW")).toBeNull();
  });
});

// ---------------------------------------------------------------- KOR-grens telt alleen echte omzet (nr 19)

describe("KOR: harde grens telt alleen uitgereikte facturen zonder REVERSE_EU (nr 19)", () => {
  it("de harde telling sluit concepten en diensten aan EU-bedrijven uit, de waarschuwing niet", async () => {
    const aggregate = vi.fn(async () => ({ _sum: { subtotal: 1234.5 } }));
    const client = { invoice: { aggregate } } as unknown as Parameters<typeof korIssuedYearRevenue>[0];
    expect(await korIssuedYearRevenue(client, "a1", 2026)).toBe(1234.5);
    const hard = (aggregate.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(hard).toMatchObject({
      userId: "a1", currency: "EUR", status: { in: ["SENT", "PAID", "OVERDUE"] },
      OR: [{ vatScheme: null }, { vatScheme: { not: "REVERSE_EU" } }],
    });
    await korYearRevenue(client, "a1", 2026);
    const warn = (aggregate.mock.calls[1] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(warn).toMatchObject({ status: { not: "CANCELED" } });
    expect(warn).not.toHaveProperty("OR");
  });
});

// ---------------------------------------------------------------- creditfactuur van een verlegde factuur (nr 9/10)

describe("creditfactuur van een factuur met btw verlegd (nr 9/10)", () => {
  const originalSnapshot = buildInvoiceSnapshot({
    userEmail: "jan@example.nl", company,
    customer: { ...customer, name: "Client SA", country: "BE", vatNumber: "BE0123456789", address: "enc:Rue 1" },
    settings: { paymentTerms: "IBAN OUD" }, vatScheme: "REVERSE_EU", locale: "nl",
  });

  function creditTx(customerNow: Record<string, unknown>) {
    const created: Record<string, unknown>[] = [];
    const tx = {
      customer: { findFirst: async () => ({ id: "c1", vatScheme: null, ...customerNow }) },
      company: { findUnique: async () => ({ vatNumber: null }) },
      invoiceSettings: {
        findUnique: async () => ({ korEnabled: false }),
        update: async () => ({ invoicePrefix: "2026-", nextNumber: 9, numberPadding: 4, defaultDueDays: 0, defaultCurrency: "EUR", defaultNotes: null }),
      },
      invoice: {
        findFirst: async () => ({ snapshot: originalSnapshot }),
        create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "cr1", ...data }; },
      },
      timeEntry: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
      auditLog: { create: async () => ({}) },
    };
    return { tx: tx as unknown as Parameters<typeof createInvoiceInTransaction>[0], created };
  }

  it("lukt ook als het btw-nummer van de klant of het eigen btw-nummer inmiddels leeg is", async () => {
    const { tx, created } = creditTx({ country: "NL", vatNumber: null });
    await createInvoiceInTransaction(tx, {
      accountId: "a1", createdById: "a1", customerId: "c1", vatScheme: "REVERSE_EU",
      lineItems: [{ description: "Advies", quantity: -1, unitPrice: 500, vatRate: 0 }],
      originalInvoice: { id: "o1", number: "2026-0003", date: new Date("2026-10-01") },
    });
    expect(created[0]).toMatchObject({ vatScheme: "REVERSE_EU", originalInvoiceId: "o1" });
  });

  it("zonder momentopname van het origineel (oude factuur): de huidige klant telt, zoals voorheen", async () => {
    const { tx } = creditTx({ country: "NL", vatNumber: null });
    (tx.invoice as unknown as { findFirst: () => Promise<unknown> }).findFirst = async () => ({ snapshot: null });
    await expect(createInvoiceInTransaction(tx, {
      accountId: "a1", createdById: "a1", customerId: "c1", vatScheme: "REVERSE_EU",
      lineItems: [{ description: "Advies", quantity: -1, unitPrice: 500, vatRate: 0 }],
      originalInvoice: { id: "o1", number: "2026-0003", date: new Date("2026-10-01") },
    })).rejects.toMatchObject({ code: "vat_scheme" });
  });

  it("bij het uitreiken krijgt de creditnota de partijen van het origineel, de rest van nu", async () => {
    const now = buildInvoiceSnapshot({
      userEmail: "jan@example.nl", company: { ...company, name: "Nieuwe Naam BV" },
      customer: { ...customer, name: "Client SA", country: "NL", vatNumber: null },
      settings: { paymentTerms: "IBAN NIEUW", korEnabled: true }, vatScheme: "REVERSE_EU", locale: "en",
    });
    const credit = creditIssueSnapshot(now, originalSnapshot);
    expect(credit.seller.name).toBe("Jansen Advies");
    expect(credit.customer).toMatchObject({ country: "BE", vatNumber: "BE0123456789" });
    expect(credit.korEnabled).toBe(false);
    expect(credit.paymentTerms).toBe("IBAN NIEUW");
    expect(credit.locale).toBe("en");
    expect(creditIssueSnapshot(now, null)).toBe(now);
  });

  it("prepareIssue van een creditfactuur leest de momentopname van het origineel", async () => {
    const credit = invoiceRow({
      id: "cr1", total: -500, subtotal: -500, lineItems: [{ vatRate: 0 }], originalInvoiceId: "o1", vatScheme: "REVERSE_EU",
      customer: { ...customer, name: "Client SA", country: "NL", vatNumber: null },
    });
    const findFirst = vi.fn(async (args: { where: { id: string } }) => (args.where.id === "o1" ? { snapshot: originalSnapshot } : credit));
    const client = { invoice: { findFirst, aggregate: vi.fn() } } as unknown as Parameters<typeof prepareIssue>[0];
    const issue = await prepareIssue(client, "a1", "cr1");
    expect(issue.problem).toBeNull();
    expect(parseInvoiceSnapshot(issue.snapshot)?.customer).toMatchObject({ country: "BE", vatNumber: "BE0123456789" });
  });
});
