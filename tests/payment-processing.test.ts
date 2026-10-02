import { beforeEach, describe, expect, it, vi } from "vitest";
import { paymentAmountMatches, paymentPeriodEnd } from "@/lib/payment-verification";

const mock = vi.hoisted(() => ({
  getPayment: vi.fn(), activate: vi.fn(), auditFind: vi.fn(), auditCreate: vi.fn(),
  invoiceFind: vi.fn(), invoiceUpdate: vi.fn(), subFind: vi.fn(), subUpdate: vi.fn(),
}));
vi.mock("@/lib/mollie", () => ({ mollie: () => ({ payments: { get: mock.getPayment } }), activateRecurringSubscription: mock.activate }));
vi.mock("@/lib/db", () => ({ db: {
  auditLog: { findUnique: mock.auditFind },
  subscription: { findUnique: mock.subFind, findFirst: mock.subFind },
} }));
vi.mock("@/lib/transaction", () => ({ serializableTransaction: async (work: (tx: unknown) => unknown) => work({
  auditLog: { findUnique: mock.auditFind, create: mock.auditCreate },
  invoice: { findUnique: mock.invoiceFind, update: mock.invoiceUpdate },
  subscription: { findUniqueOrThrow: mock.subFind, update: mock.subUpdate },
}) }));
import { POST } from "@/app/api/webhooks/mollie/route";
import { PLANS } from "@/lib/plans";

const request = () => new Request("https://saldova.example/api/webhooks/mollie", { method: "POST", body: "id=tr_test12345", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
beforeEach(() => {
  vi.resetAllMocks();
  mock.auditFind.mockResolvedValue(null);
  mock.activate.mockResolvedValue("sub_test");
});

describe("authoritative payment checks", () => {
  it("checks exact cents and currency and rejects malformed amounts", () => {
    expect(paymentAmountMatches({ currency: "EUR", value: "121.00" }, 121)).toBe(true);
    for (const amount of [{ currency: "EUR", value: "120.99" }, { currency: "USD", value: "121.00" }, { currency: "EUR", value: "121junk" }]) expect(paymentAmountMatches(amount, 121)).toBe(false);
    expect(paymentAmountMatches({ currency: "EUR", value: "0.00" }, 0)).toBe(false);
  });
  it("uses paidAt and clamps month ends, including leap years", () => {
    expect(paymentPeriodEnd("2026-01-31T10:00:00Z").toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(paymentPeriodEnd("2024-01-31T10:00:00Z").toISOString()).toBe("2024-02-29T10:00:00.000Z");
    expect(() => paymentPeriodEnd("invalid")).toThrow();
  });
  it("asks the provider to retry after a processing outage", async () => {
    mock.getPayment.mockRejectedValue(new Error("provider down"));
    expect((await POST(request())).status).toBe(503);
    expect(mock.auditCreate).not.toHaveBeenCalled();
  });
  it("ignores forged status fields and rejects invalid payment ids", async () => {
    const response = await POST(new Request("https://saldova.example/api/webhooks/mollie", { method: "POST", body: "id=invalid&status=paid" }));
    expect(response.status).toBe(400); expect(mock.getPayment).not.toHaveBeenCalled();
  });
  it("does not settle an invoice for a mismatched amount", async () => {
    mock.getPayment.mockResolvedValue({ id: "tr_test12345", metadata: { invoiceId: "inv" }, status: "paid", amount: { currency: "EUR", value: "1.00" } });
    mock.invoiceFind.mockResolvedValue({ id: "inv", userId: "owner", total: 121, currency: "EUR", status: "SENT" });
    expect((await POST(request())).status).toBe(503);
    expect(mock.invoiceUpdate).not.toHaveBeenCalled();
  });
  it("records a successful payment once even when its notification is replayed", async () => {
    mock.getPayment.mockResolvedValue({ id: "tr_test12345", metadata: { invoiceId: "inv" }, status: "paid", amount: { currency: "EUR", value: "121.00" } });
    mock.invoiceFind.mockResolvedValue({ id: "inv", userId: "owner", invoiceNumber: "2026-1", total: 121, currency: "EUR", status: "SENT" });
    const processed = new Set<string>();
    mock.auditFind.mockImplementation(async ({ where }) => processed.has(where.id) ? { id: where.id } : null);
    mock.auditCreate.mockImplementation(async ({ data }) => { processed.add(data.id); return data; });
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    expect(mock.invoiceUpdate).toHaveBeenCalledTimes(1); expect(mock.auditCreate).toHaveBeenCalledTimes(1);
  });
  it("does not grant access when provider customer and account do not match", async () => {
    mock.getPayment.mockResolvedValue({ id: "tr_test12345", metadata: { userId: "owner", plan: "PRO" }, customerId: "customer-other", status: "paid", sequenceType: "first", amount: { currency: "EUR", value: PLANS.PRO.price.toFixed(2) }, paidAt: "2026-01-31T10:00:00Z" });
    mock.subFind.mockResolvedValue({ id: "subscription", userId: "owner", mollieCustomerId: "customer-owner" });
    expect((await POST(request())).status).toBe(503); expect(mock.activate).not.toHaveBeenCalled(); expect(mock.subUpdate).not.toHaveBeenCalled();
  });
  it("extends the paid period from the transaction timestamp, not webhook arrival", async () => {
    mock.getPayment.mockResolvedValue({ id: "tr_test12345", metadata: { userId: "owner", plan: "PRO" }, customerId: "customer-owner", subscriptionId: "sub_test", status: "paid", sequenceType: "recurring", amount: { currency: "EUR", value: PLANS.PRO.price.toFixed(2) }, paidAt: "2026-01-31T10:00:00Z", createdAt: "2026-01-31T09:00:00Z" });
    mock.subFind.mockResolvedValue({ id: "subscription", userId: "owner", mollieCustomerId: "customer-owner", mollieSubscriptionId: "sub_test", plan: "PRO", currentPeriodEnd: new Date("2026-01-31T10:00:00Z") });
    expect((await POST(request())).status).toBe(200);
    expect(mock.subUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentPeriodEnd: new Date("2026-02-28T10:00:00Z"), status: "ACTIVE" }) }));
  });
  it.each([
    ["2026-01-31T08:00:00Z", true],
    ["2026-01-30T23:59:59Z", false],
  ])("a failed charge created at %s only affects the relevant billing date", async (createdAt, shouldSuspend) => {
    mock.getPayment.mockResolvedValue({ id: "tr_test12345", metadata: { userId: "owner", plan: "PRO" }, customerId: "customer-owner", subscriptionId: "sub_test", status: "failed", sequenceType: "recurring", amount: { currency: "EUR", value: PLANS.PRO.price.toFixed(2) }, createdAt });
    mock.subFind.mockResolvedValue({ id: "subscription", userId: "owner", mollieCustomerId: "customer-owner", mollieSubscriptionId: "sub_test", plan: "PRO", status: "ACTIVE", currentPeriodEnd: new Date("2026-01-31T10:00:00Z") });
    expect((await POST(request())).status).toBe(200);
    if (shouldSuspend) expect(mock.subUpdate).toHaveBeenCalledWith({ where: { id: "subscription" }, data: { status: "PAST_DUE" } });
    else expect(mock.subUpdate).not.toHaveBeenCalled();
  });
});
