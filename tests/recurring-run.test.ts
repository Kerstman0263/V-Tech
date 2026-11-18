import { beforeEach, describe, expect, it, vi } from "vitest";

// Geen database: alleen de nagebootste aanroepen die runDueRecurringInvoices doet.
const { db, sendInvoiceEmail, createInvoiceInTransaction } = vi.hoisted(() => ({
  db: {
    recurringInvoice: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    subscription: { findUnique: vi.fn() },
    company: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  sendInvoiceEmail: vi.fn(),
  createInvoiceInTransaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/invoice-send", () => ({ sendInvoiceEmail }));
vi.mock("@/lib/invoice-write", () => ({ createInvoiceInTransaction }));
vi.mock("@/lib/invoice-settings", () => ({ getOrCreateInvoiceSettings: vi.fn(async () => ({})) }));
vi.mock("@/lib/transaction", () => ({ serializableTransaction: (fn: (tx: typeof db) => unknown) => fn(db) }));

import { runDueRecurringInvoices } from "@/lib/recurring";

const NOW = new Date("2026-11-18T09:00:00Z");
const DUE = new Date("2026-11-17T09:00:00Z");

function schedule(id: string, userId: string) {
  return {
    id, userId, active: true, nextRunAt: DUE, interval: "MONTHLY", autoSend: true, customerId: "c1", notes: null,
    lineItems: [{ description: "Onderhoud", quantity: 1, unitPrice: 100, vatRate: 21 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.recurringInvoice.updateMany.mockResolvedValue({ count: 1 });
  db.company.findUnique.mockResolvedValue({ accountType: "ZZP" });
  createInvoiceInTransaction.mockResolvedValue({ id: "inv1", invoiceNumber: "2026-0001" });
});

describe("runDueRecurringInvoices", () => {
  it("haalt de oudste schema's eerst op", async () => {
    db.recurringInvoice.findMany.mockResolvedValue([]);
    await runDueRecurringInvoices(NOW);
    expect(db.recurringInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { nextRunAt: "asc" } }));
  });

  it("pauzeert de schema's van een Gratis-account en meldt dat in Activiteit", async () => {
    db.recurringInvoice.findMany.mockResolvedValue([schedule("r1", "free"), schedule("r2", "free")]);
    db.subscription.findUnique.mockResolvedValue({ plan: "FREE", status: "ACTIVE", trialEndsAt: null });
    const result = await runDueRecurringInvoices(NOW);
    expect(result).toMatchObject({ created: 0, skipped: 2 });
    expect(db.recurringInvoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "free", active: true }),
      data: { active: false },
    }));
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ accountId: "free", action: "invoice.recurring_paused_plan" }) });
    expect(createInvoiceInTransaction).not.toHaveBeenCalled();
    expect(sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("een factuur zonder afzendergegevens wordt niet gemaild en komt in Activiteit", async () => {
    db.recurringInvoice.findMany.mockResolvedValue([schedule("r1", "pro")]);
    db.recurringInvoice.findFirst.mockResolvedValue(schedule("r1", "pro"));
    db.subscription.findUnique.mockResolvedValue({ plan: "PRO", status: "ACTIVE", trialEndsAt: null });
    sendInvoiceEmail.mockResolvedValue("sender_details_missing");
    const result = await runDueRecurringInvoices(NOW);
    expect(result).toMatchObject({ created: 1, sent: 0, failed: 1 });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "invoice.send_blocked_sender", target: "2026-0001" }) });
  });
});
