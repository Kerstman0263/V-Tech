import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ plan: "FREE" as string | null, customers: 0, invoices: [] as { createdAt: Date; total: number }[] }));

vi.mock("@/lib/db", () => ({
  db: {
    subscription: { findUnique: async () => (state.plan ? { plan: state.plan } : null) },
    customer: { count: async () => state.customers },
    invoice: {
      count: async ({ where }: { where: { createdAt: { gte: Date }; total: { gte: number } } }) =>
        state.invoices.filter((i) => i.createdAt >= where.createdAt.gte && i.total >= where.total.gte).length,
    },
  },
}));

import { assertCanAddCustomers, assertCanCreateInvoice, remainingCustomerSlots } from "@/lib/plan-limits";

const now = new Date(Date.UTC(2026, 9, 15));
beforeEach(() => {
  state.plan = "FREE";
  state.customers = 0;
  state.invoices = [];
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
