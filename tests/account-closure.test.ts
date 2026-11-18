import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Account verwijderen zegt eerst het Mollie-abonnement op. Mislukt dat, dan
// blijft het account bestaan (anders blijft Mollie afschrijven). Alles met
// mocks, zonder database en zonder Mollie.

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  subFind: vi.fn(), subFindFirst: vi.fn(), userFind: vi.fn(), userDelete: vi.fn(), auditFind: vi.fn(), auditCreate: vi.fn(),
  cancelHelper: vi.fn(),
  subGet: vi.fn(), subIterate: vi.fn(), subCancel: vi.fn(),
  mandateIterate: vi.fn(), mandateRevoke: vi.fn(),
  customerDelete: vi.fn(), paymentGet: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mock.auth }));
vi.mock("bcryptjs", () => ({ default: { compare: mock.compare } }));
vi.mock("@/lib/db", () => ({
  db: {
    subscription: { findUnique: mock.subFind, findFirst: mock.subFindFirst },
    user: { findUnique: mock.userFind, delete: mock.userDelete },
    auditLog: { findUnique: mock.auditFind, create: mock.auditCreate },
  },
}));
vi.mock("@/lib/mollie", () => ({
  mollie: () => ({
    customerSubscriptions: { get: mock.subGet, iterate: mock.subIterate, cancel: mock.subCancel },
    customerMandates: { iterate: mock.mandateIterate, revoke: mock.mandateRevoke },
    customers: { delete: mock.customerDelete },
    payments: { get: mock.paymentGet },
  }),
  cancelRecurringSubscription: mock.cancelHelper,
  activateRecurringSubscription: vi.fn(),
}));
vi.mock("@/lib/transaction", () => ({ serializableTransaction: vi.fn() }));

import { BillingCloseError, closeMollieBilling, describeClosure } from "@/lib/account-closure";
import { DELETE as deleteOwnAccount } from "@/app/api/account/route";
import { DELETE as adminDeleteUser } from "@/app/api/admin/users/[id]/route";
import { POST as mollieWebhook } from "@/app/api/webhooks/mollie/route";

const listOf = <T,>(items: T[]) => async function* () { yield* items; };
const gone = () => Object.assign(new Error("Not found"), { statusCode: 404 });
const platformLogs = () => mock.auditCreate.mock.calls.map(([arg]) => arg.data as { action: string; target: string });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MOLLIE_API_KEY", "test_mock_client_only");
  mock.subFind.mockResolvedValue({ mollieCustomerId: "cst_test", mollieSubscriptionId: "sub_linked" });
  mock.cancelHelper.mockResolvedValue(undefined);
  mock.subIterate.mockImplementation(listOf([
    { id: "sub_linked", status: "canceled" },
    { id: "sub_old", status: "active" },
    { id: "sub_done", status: "completed" },
  ]));
  mock.subCancel.mockResolvedValue({});
  mock.mandateIterate.mockImplementation(listOf([{ id: "mdt_valid", status: "valid" }, { id: "mdt_old", status: "invalid" }]));
  mock.mandateRevoke.mockResolvedValue(true);
  mock.customerDelete.mockResolvedValue(true);
  mock.auditCreate.mockResolvedValue({});
  mock.compare.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Mollie opzeggen vóór verwijderen", () => {
  it("zegt het gekoppelde en elk ander lopend abonnement op, trekt mandaten in en verwijdert de klant", async () => {
    const result = await closeMollieBilling("owner");
    expect(mock.cancelHelper).toHaveBeenCalledWith("owner");
    expect(mock.subCancel).toHaveBeenCalledTimes(1);
    expect(mock.subCancel).toHaveBeenCalledWith("sub_old", { customerId: "cst_test" });
    expect(mock.mandateRevoke).toHaveBeenCalledTimes(1);
    expect(mock.mandateRevoke).toHaveBeenCalledWith("mdt_valid", { customerId: "cst_test" });
    expect(mock.customerDelete).toHaveBeenCalledWith("cst_test");
    expect(result).toEqual({ customerId: "cst_test", canceledSubscriptions: ["sub_linked", "sub_old"], revokedMandates: ["mdt_valid"], customerDeleted: true, skipped: null });
    expect(describeClosure("account owner", result)).toContain("cst_test");
  });

  it("zonder abonnement of zonder Mollie-klant: niets op te zeggen", async () => {
    mock.subFind.mockResolvedValueOnce(null);
    expect((await closeMollieBilling("member")).skipped).toBe("no_subscription");
    mock.subFind.mockResolvedValueOnce({ mollieCustomerId: null, mollieSubscriptionId: null });
    expect((await closeMollieBilling("free")).skipped).toBe("no_customer");
    expect(mock.cancelHelper).not.toHaveBeenCalled();
    expect(mock.subIterate).not.toHaveBeenCalled();
  });

  it("zonder Mollie-sleutel: gewoon door, zonder iets bij Mollie te doen", async () => {
    vi.stubEnv("MOLLIE_API_KEY", "");
    expect((await closeMollieBilling("owner")).skipped).toBe("no_api_key");
    expect(mock.cancelHelper).not.toHaveBeenCalled();
  });

  it("een abonnement dat al was opgezegd is geen fout", async () => {
    mock.cancelHelper.mockRejectedValue(Object.assign(new Error("already canceled"), { statusCode: 422 }));
    mock.subGet.mockResolvedValue({ id: "sub_linked", status: "canceled" });
    await expect(closeMollieBilling("owner")).resolves.toMatchObject({ customerDeleted: true });
  });

  it("een klant die bij Mollie al weg is, is geen fout", async () => {
    mock.cancelHelper.mockRejectedValue(gone());
    mock.subGet.mockRejectedValue(gone());
    mock.subIterate.mockImplementation(async function* () { throw gone(); });
    await expect(closeMollieBilling("owner")).resolves.toMatchObject({ customerDeleted: true });
    expect(mock.mandateIterate).not.toHaveBeenCalled();
  });

  it("opzeggen mislukt terwijl het abonnement nog loopt: BillingCloseError", async () => {
    mock.cancelHelper.mockRejectedValue(new Error("Mollie down"));
    mock.subGet.mockResolvedValue({ id: "sub_linked", status: "active" });
    const err = await closeMollieBilling("owner").catch((e) => e);
    expect(err).toBeInstanceOf(BillingCloseError);
    expect(err).toMatchObject({ status: 502, code: "billing_cancel_failed", customerId: "cst_test" });
    expect(mock.customerDelete).not.toHaveBeenCalled();
  });

  it("mandaat intrekken mislukt: ook afbreken", async () => {
    mock.mandateRevoke.mockRejectedValue(new Error("timeout"));
    await expect(closeMollieBilling("owner")).rejects.toBeInstanceOf(BillingCloseError);
  });

  it("abonnement al opgezegd, daarna mislukt het mandaat: eerlijke melding over het gedeeltelijke resultaat", async () => {
    mock.mandateRevoke.mockRejectedValue(new Error("timeout"));
    const err = await closeMollieBilling("owner").catch((e) => e);
    expect(err).toBeInstanceOf(BillingCloseError);
    expect(err).toMatchObject({ status: 502, code: "billing_cancel_partial", partial: { canceledSubscriptions: ["sub_linked", "sub_old"], revokedMandates: [] } });
    expect(err.message).toContain("is wel al opgezegd");
    expect(err.message).not.toContain("niet opzeggen");
  });

  it("niets gelukt: de gewone melding dat opzeggen mislukte", async () => {
    mock.cancelHelper.mockRejectedValue(new Error("Mollie down"));
    mock.subGet.mockResolvedValue({ id: "sub_linked", status: "active" });
    const err = await closeMollieBilling("owner").catch((e) => e);
    expect(err).toMatchObject({ code: "billing_cancel_failed", partial: { canceledSubscriptions: [], revokedMandates: [] } });
    expect(err.message).toContain("niet opzeggen");
  });

  it("alleen de klant verwijderen mislukt: niet afbreken, wel melden", async () => {
    mock.customerDelete.mockRejectedValue(new Error("timeout"));
    const result = await closeMollieBilling("owner");
    expect(result.customerDeleted).toBe(false);
    expect(describeClosure("x", result)).toContain("NIET verwijderd");
  });
});

describe("DELETE /api/account", () => {
  const request = () => new Request("https://saldova.example/api/account", { method: "DELETE", body: JSON.stringify({ password: "geheim", exportConfirmed: true }) });
  beforeEach(() => {
    mock.auth.mockResolvedValue({ user: { id: "owner", accountId: "owner", email: "eigenaar@voorbeeld.test", role: "USER" } });
    mock.userFind.mockResolvedValue({ passwordHash: "hash" });
  });

  it("breekt af als Mollie niet kan worden opgezegd: account blijft bestaan", async () => {
    mock.cancelHelper.mockRejectedValue(new Error("Mollie down"));
    mock.subGet.mockResolvedValue({ id: "sub_linked", status: "active" });
    const res = await deleteOwnAccount(request());
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "billing_cancel_failed" });
    expect(mock.userDelete).not.toHaveBeenCalled();
    expect(platformLogs().some((l) => l.action === "account.billing_close_failed" && l.target.includes("cst_test"))).toBe(true);
  });

  it("gedeeltelijk opgezegd: eigen code, zodat het scherm een eerlijke melding toont", async () => {
    mock.mandateRevoke.mockRejectedValue(new Error("timeout"));
    const res = await deleteOwnAccount(request());
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "billing_cancel_partial" });
    expect(mock.userDelete).not.toHaveBeenCalled();
  });

  it("zegt eerst op en verwijdert daarna; het Mollie-id staat in het platformlog", async () => {
    const order: string[] = [];
    mock.cancelHelper.mockImplementation(async () => { order.push("cancel"); });
    mock.userDelete.mockImplementation(async () => { order.push("delete"); return {}; });
    const res = await deleteOwnAccount(request());
    expect(res.status).toBe(200);
    expect(order).toEqual(["cancel", "delete"]);
    expect(platformLogs().some((l) => l.action === "account.billing_closed" && l.target.includes("cst_test"))).toBe(true);
  });

  it("een verkeerd wachtwoord raakt Mollie niet aan", async () => {
    mock.compare.mockResolvedValue(false);
    expect((await deleteOwnAccount(request())).status).toBe(400);
    expect(mock.cancelHelper).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/users/:id", () => {
  const request = () => new Request("https://saldova.example/api/admin/users/klant", { method: "DELETE", body: JSON.stringify({ exportConfirmed: true }) });
  const params = { params: Promise.resolve({ id: "klant" }) };
  beforeEach(() => {
    mock.auth.mockResolvedValue({ user: { id: "admin", accountId: "admin", email: "beheer@voorbeeld.test", role: "OWNER" } });
    mock.userFind.mockResolvedValue({ role: "USER", email: "klant@voorbeeld.test" });
  });

  it("breekt af als Mollie niet kan worden opgezegd", async () => {
    mock.mandateRevoke.mockRejectedValue(new Error("timeout"));
    const res = await adminDeleteUser(request(), params);
    expect(res.status).toBe(502);
    expect(mock.userDelete).not.toHaveBeenCalled();
  });

  it("gedeeltelijk opgezegd: de beheerder ziet dat, en het platformlog noemt wat al gedaan is", async () => {
    mock.mandateRevoke.mockRejectedValue(new Error("timeout"));
    const res = await adminDeleteUser(request(), params);
    const body = await res.json();
    expect(body.code).toBe("billing_cancel_partial");
    expect(body.error).toContain("al een deel");
    const failed = platformLogs().find((l) => l.action === "account.billing_close_failed");
    expect(failed?.target).toContain("cst_test");
    expect(failed?.target).toContain("sub_linked, sub_old opgezegd");
    expect(failed?.target).toContain("account niet verwijderd");
  });

  it("zegt op en verwijdert daarna", async () => {
    mock.userDelete.mockResolvedValue({});
    expect((await adminDeleteUser(request(), params)).status).toBe(200);
    expect(mock.cancelHelper).toHaveBeenCalledWith("klant");
    expect(mock.userDelete).toHaveBeenCalledWith({ where: { id: "klant" } });
  });
});

describe("Mollie-webhook: betaling voor een onbekende klant", () => {
  it("antwoordt 200 en logt een waarschuwing met het Mollie-id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mock.paymentGet.mockResolvedValue({ id: "tr_test12345", status: "paid", customerId: "cst_weg", sequenceType: "recurring", metadata: null });
    mock.auditFind.mockResolvedValue(null);
    mock.subFindFirst.mockResolvedValue(null);
    const res = await mollieWebhook(new Request("https://saldova.example/api/webhooks/mollie", { method: "POST", body: "id=tr_test12345" }));
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith("mollie_webhook_unknown_customer", expect.objectContaining({ paymentId: "tr_test12345", customerId: "cst_weg" }));
    expect(platformLogs().some((l) => l.action === "billing.payment_unknown_customer" && l.target.includes("cst_weg"))).toBe(true);
    warn.mockRestore();
  });
});
