import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  plan: "FREE" as string | null,
  customers: 0,
  invoices: [] as { createdAt: Date; total: number }[],
  // Groei-proef: status + einddatum + accounttype. null = zoals bestaande accounts (alleen een plan).
  trial: null as null | { status: string; trialEndsAt: Date | null; accountType: "ZZP" | "BEDRIJF" },
}));

vi.mock("@/lib/db", () => ({
  db: {
    subscription: {
      findUnique: async () => {
        if (!state.plan) return null;
        if (!state.trial) return { plan: state.plan };
        return { plan: state.plan, status: state.trial.status, trialEndsAt: state.trial.trialEndsAt, user: { company: { accountType: state.trial.accountType } } };
      },
    },
    customer: { count: async () => state.customers },
    invoice: {
      count: async ({ where }: { where: { createdAt: { gte: Date }; total: { gte: number } } }) =>
        state.invoices.filter((i) => i.createdAt >= where.createdAt.gte && i.total >= where.total.gte).length,
    },
  },
}));

import { assertCanAddCustomers, assertCanCreateInvoice, invoiceCountStart, remainingCustomerSlots } from "@/lib/plan-limits";

const now = new Date(Date.UTC(2026, 9, 15));
beforeEach(() => {
  state.plan = "FREE";
  state.customers = 0;
  state.invoices = [];
  state.trial = null;
});

/** Klant-limieten lezen de klok zelf: zet de tijd vast tijdens `fn`. */
async function atTime<T>(at: Date, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  try {
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}

describe("plan limits tijdens en na de Groei-proef", () => {
  const trialEnd = new Date(Date.UTC(2026, 11, 20, 10)); // proef gestart 20 november 2026
  const inTrial = new Date(Date.UTC(2026, 11, 10));
  const afterTrial = new Date(Date.UTC(2026, 11, 22));
  const zzpTrial = { status: "TRIALING", trialEndsAt: trialEnd, accountType: "ZZP" as const };

  it("in de proef: onbeperkt klanten en facturen (Groei)", async () => {
    state.trial = zzpTrial;
    state.customers = 40;
    state.invoices = Array.from({ length: 30 }, () => ({ createdAt: new Date(Date.UTC(2026, 11, 5)), total: 100 }));
    await atTime(inTrial, async () => {
      expect(await remainingCustomerSlots("acc")).toBeNull();
      await expect(assertCanAddCustomers("acc", 10)).resolves.toBeUndefined();
    });
    await expect(assertCanCreateInvoice("acc", inTrial)).resolves.toBeUndefined();
  });

  it("na de proef: gratis limiet voor nieuwe facturen; facturen uit de proef blijven en blokkeren niet", async () => {
    state.trial = zzpTrial;
    state.invoices = Array.from({ length: 30 }, () => ({ createdAt: new Date(Date.UTC(2026, 11, 5)), total: 100 }));
    await expect(assertCanCreateInvoice("acc", afterTrial)).resolves.toBeUndefined();
    // Na het einde van de proef weer 5 per maand
    state.invoices.push(...Array.from({ length: 5 }, () => ({ createdAt: new Date(Date.UTC(2026, 11, 21)), total: 100 })));
    await expect(assertCanCreateInvoice("acc", afterTrial)).rejects.toMatchObject({ status: 402 });
    // Volgende maand: gewoon vanaf de 1e
    state.invoices = Array.from({ length: 4 }, () => ({ createdAt: new Date(Date.UTC(2027, 0, 2)), total: 100 }));
    await expect(assertCanCreateInvoice("acc", new Date(Date.UTC(2027, 0, 10)))).resolves.toBeUndefined();
  });

  it("na de proef: bestaande klanten blijven, nieuwe klanten volgens de gratis limiet", async () => {
    state.trial = zzpTrial;
    state.customers = 12;
    await atTime(afterTrial, async () => {
      expect(await remainingCustomerSlots("acc")).toBe(0);
      await expect(assertCanAddCustomers("acc")).rejects.toMatchObject({ status: 402 });
    });
  });

  it("betaald na de proef: geen limieten", async () => {
    state.plan = "GROWTH";
    state.trial = { ...zzpTrial, status: "ACTIVE" };
    state.invoices = Array.from({ length: 30 }, () => ({ createdAt: new Date(Date.UTC(2026, 11, 21)), total: 100 }));
    await expect(assertCanCreateInvoice("acc", afterTrial)).resolves.toBeUndefined();
  });

  it("invoiceCountStart: alleen in de maand waarin de proef afliep", () => {
    const monthStart = new Date(Date.UTC(2026, 11, 1));
    const sub = { plan: "FREE" as const, status: "TRIALING" as const, trialEndsAt: trialEnd };
    expect(invoiceCountStart(monthStart, sub, "ZZP", afterTrial)).toEqual(trialEnd);
    expect(invoiceCountStart(monthStart, sub, "ZZP", inTrial)).toEqual(monthStart);
    const jan = new Date(Date.UTC(2027, 0, 1));
    expect(invoiceCountStart(jan, sub, "ZZP", new Date(Date.UTC(2027, 0, 5)))).toEqual(jan);
    expect(invoiceCountStart(monthStart, { plan: "FREE", status: "TRIALING", trialEndsAt: null }, "ZZP", afterTrial)).toEqual(monthStart);
    expect(invoiceCountStart(monthStart, sub, "BEDRIJF", afterTrial)).toEqual(monthStart);
  });
});

describe("plan limits", () => {
  it("allows three customers on Free and blocks the fourth with a 402", async () => {
    state.customers = 2;
    await expect(assertCanAddCustomers("acc")).resolves.toBeUndefined();
    state.customers = 3;
    await expect(assertCanAddCustomers("acc")).rejects.toMatchObject({ status: 402 });
    expect(await remainingCustomerSlots("acc")).toBe(0);
  });

  it("treats a missing subscription as Free and paid plans as unlimited", async () => {
    state.plan = null;
    state.customers = 3;
    await expect(assertCanAddCustomers("acc")).rejects.toMatchObject({ status: 402 });
    state.plan = "GROWTH";
    state.customers = 500;
    expect(await remainingCustomerSlots("acc")).toBeNull();
    await expect(assertCanAddCustomers("acc", 100)).resolves.toBeUndefined();
  });

  it("counts five invoices per calendar month, ignoring last month and credit notes", async () => {
    state.invoices = [
      ...Array.from({ length: 4 }, () => ({ createdAt: new Date(Date.UTC(2026, 9, 2)), total: 121 })),
      { createdAt: new Date(Date.UTC(2026, 9, 3)), total: -121 },
      { createdAt: new Date(Date.UTC(2026, 8, 30)), total: 50 },
    ];
    await expect(assertCanCreateInvoice("acc", now)).resolves.toBeUndefined();
    state.invoices.push({ createdAt: new Date(Date.UTC(2026, 9, 10)), total: 10 });
    await expect(assertCanCreateInvoice("acc", now)).rejects.toMatchObject({ status: 402 });
    state.plan = "PRO";
    await expect(assertCanCreateInvoice("acc", now)).resolves.toBeUndefined();
  });
});
