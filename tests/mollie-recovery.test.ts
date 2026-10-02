import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLANS } from "@/lib/plans";

const mock = vi.hoisted(() => ({ findSubscription: vi.fn(), iterate: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { subscription: { findUnique: mock.findSubscription } } }));
vi.mock("@mollie/api-client", () => ({
  default: () => ({ customerSubscriptions: { iterate: mock.iterate, create: mock.create } }),
  SequenceType: { first: "first" },
}));
import { activateRecurringSubscription } from "@/lib/mollie";

const userId = "owner-local-test";
const customerId = "cst_localtest";
const paymentId = "tr_localtest";
const paidAt = "2026-08-08T10:00:00Z";
const providerSubscription = (overrides: Record<string, unknown> = {}) => ({
  id: "sub_localtest", customerId, status: "active", interval: "1 month",
  amount: { currency: "EUR", value: PLANS.PRO.price.toFixed(2) },
  metadata: { userId, plan: "PRO", originatingPaymentId: paymentId },
  ...overrides,
});
function listed(subscriptions: ReturnType<typeof providerSubscription>[]) {
  mock.iterate.mockImplementation(async function* () { yield* subscriptions; });
}
const activate = () => activateRecurringSubscription(userId, "PRO", paymentId, paidAt);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MOLLIE_API_KEY", "test_mock_client_only");
  mock.findSubscription.mockResolvedValue({ mollieCustomerId: customerId, mollieSubscriptionId: null, status: "TRIALING" });
  listed([]);
  mock.create.mockResolvedValue(providerSubscription());
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("recovering a provider subscription after an interrupted local commit", () => {
  it("stores the originating payment while retaining recurring webhook metadata", async () => {
    expect(await activate()).toBe("sub_localtest");
    expect(mock.iterate).toHaveBeenCalledWith(expect.objectContaining({ customerId }));
    expect(mock.create).toHaveBeenCalledOnce();
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({
      customerId, metadata: { userId, plan: "PRO", originatingPaymentId: paymentId },
      idempotencyKey: `subscription-${paymentId}`, startDate: "2026-09-08",
      amount: { currency: "EUR", value: PLANS.PRO.price.toFixed(2) }, interval: "1 month",
    }));
  });

  it("recovers the same provider subscription beyond the one-hour idempotency window without creating another", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:01:00Z"));
    expect(await activate()).toBe("sub_localtest");
    // No local id was saved. The provider record survives that failed commit.
    listed([providerSubscription()]);
    vi.setSystemTime(new Date("2026-08-08T12:02:00Z"));
    expect(await activate()).toBe("sub_localtest");
    expect(mock.create).toHaveBeenCalledOnce();
  });

  it("also recovers when the provider accepted a create whose response was lost", async () => {
    mock.create.mockImplementationOnce(async () => {
      listed([providerSubscription()]);
      throw new Error("network response lost");
    });
    await expect(activate()).rejects.toThrow("network response lost");
    expect(await activate()).toBe("sub_localtest");
    expect(mock.create).toHaveBeenCalledOnce();
  });

  it.each(["active", "pending"])("reuses a matching %s subscription", async (status) => {
    listed([providerSubscription({ status })]);
    expect(await activate()).toBe("sub_localtest");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it.each(["canceled", "suspended", "completed"])("does not recreate a matching %s subscription", async (status) => {
    listed([providerSubscription({ status })]);
    await expect(activate()).rejects.toThrow("provider details do not match");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it.each([
    { amount: { currency: "EUR", value: "0.01" } },
    { amount: { currency: "USD", value: PLANS.PRO.price.toFixed(2) } },
    { metadata: { userId, plan: "GROWTH", originatingPaymentId: paymentId } },
    { metadata: { userId: "another-owner", plan: "PRO", originatingPaymentId: paymentId } },
    { interval: "1 day" },
    { customerId: "cst_anothercustomer" },
    { canceledAt: "2026-08-08T11:00:00Z" },
  ])("rejects mismatched provider details without starting another debit: %j", async (overrides) => {
    listed([providerSubscription(overrides)]);
    await expect(activate()).rejects.toThrow();
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("checks the full listing and refuses ambiguous matches", async () => {
    listed([providerSubscription(), providerSubscription({ id: "sub_duplicate" })]);
    await expect(activate()).rejects.toThrow("multiple matches");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it.each([
    { userId, plan: "PRO", originatingPaymentId: "tr_otherpayment" },
    { userId, plan: "PRO" },
    null,
  ])("does not create alongside another live or unidentifiable subscription: %j", async (metadata) => {
    listed([providerSubscription({ metadata })]);
    await expect(activate()).rejects.toThrow("another subscription exists");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("checks a legacy subscription that is already linked locally", async () => {
    mock.findSubscription.mockResolvedValue({ mollieCustomerId: customerId, mollieSubscriptionId: "sub_localtest", status: "ACTIVE" });
    listed([providerSubscription({ metadata: { userId, plan: "PRO" } })]);
    expect(await activate()).toBe("sub_localtest");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("does not trust a local link whose provider subscription is absent", async () => {
    mock.findSubscription.mockResolvedValue({ mollieCustomerId: customerId, mollieSubscriptionId: "sub_missing", status: "ACTIVE" });
    await expect(activate()).rejects.toThrow("linked subscription missing");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("does not use a local link for a different originating payment", async () => {
    mock.findSubscription.mockResolvedValue({ mollieCustomerId: customerId, mollieSubscriptionId: "sub_localtest", status: "ACTIVE" });
    listed([providerSubscription({ metadata: { userId, plan: "PRO", originatingPaymentId: "tr_otherpayment" } })]);
    await expect(activate()).rejects.toThrow("provider details do not match");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("allows a new payment after an unrelated subscription has ended", async () => {
    mock.findSubscription.mockResolvedValue({ mollieCustomerId: customerId, mollieSubscriptionId: "sub_old", status: "CANCELED" });
    listed([providerSubscription({ id: "sub_old", status: "canceled", metadata: { userId, plan: "PRO", originatingPaymentId: "tr_oldpayment" } })]);
    expect(await activate()).toBe("sub_localtest");
    expect(mock.create).toHaveBeenCalledOnce();
  });

  it("fails closed if the provider listing cannot be completed", async () => {
    mock.iterate.mockImplementation(async function* () {
      yield providerSubscription();
      throw new Error("next page unavailable");
    });
    await expect(activate()).rejects.toThrow("next page unavailable");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("fails closed at the scan limit instead of assuming no subscription exists", async () => {
    listed(Array.from({ length: 251 }, (_, index) => providerSubscription({
      id: `sub_history${index}`, status: "completed", metadata: { originatingPaymentId: `tr_old${index}` },
    })));
    await expect(activate()).rejects.toThrow("lookup limit reached");
    expect(mock.create).not.toHaveBeenCalled();
  });
});
