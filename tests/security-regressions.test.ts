import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTrustedMutation } from "@/lib/request-security";
import { createInvoiceAccessToken, verifyInvoiceAccessToken, INVOICE_LINK_DAYS } from "@/lib/invoice-access";
import { credentialFingerprint, credentialsUnchanged } from "@/lib/session-security";

const now = Date.UTC(2026, 8, 5);
beforeEach(() => vi.stubEnv("AUTH_SECRET", "saldova-test-secret-not-for-production-123456789"));
afterEach(() => vi.unstubAllEnvs());

describe("browser origin protection", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects cross-site %s requests even with a session cookie", (method) => {
    expect(isTrustedMutation(new Request("https://saldova.vercel.app/api/invoices", { method, headers: { origin: "https://attacker.example", cookie: "session=present" } }))).toBe(false);
  });
  it("allows the current application origin and authenticated non-browser clients", () => {
    expect(isTrustedMutation(new Request("https://saldova.vercel.app/api/invoices", { method: "POST", headers: { origin: "https://saldova.vercel.app" } }))).toBe(true);
    expect(isTrustedMutation(new Request("https://saldova.vercel.app/api/invoices", { method: "POST" }))).toBe(true);
  });
  it("rejects opaque and same-site sibling origins", () => {
    for (const origin of ["null", "https://evil.saldova.vercel.app", "https://saldova.vercel.app.evil.example"]) {
      expect(isTrustedMutation(new Request("https://saldova.vercel.app/api/billing/cancel", { method: "POST", headers: { origin } }))).toBe(false);
    }
    expect(isTrustedMutation(new Request("https://saldova.vercel.app/api/billing/cancel", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))).toBe(false);
  });
});

describe("limited invoice links", () => {
  it("grants only the signed invoice and account", () => {
    const token = createInvoiceAccessToken("invoice-a", "account-a", now);
    expect(verifyInvoiceAccessToken(token, "invoice-a", now)).toEqual({ accountId: "account-a" });
    expect(verifyInvoiceAccessToken(token, "invoice-b", now)).toBeNull();
  });
  it("rejects altered accounts, signatures, malformed and oversized values", () => {
    const token = createInvoiceAccessToken("invoice-a", "account-a", now);
    const [payload, signature] = token.split(".");
    const altered = Buffer.from(Buffer.from(payload, "base64url").toString().replace("account-a", "account-b")).toString("base64url");
    for (const invalid of [altered + "." + signature, token + ".extra", "bad.bad", "x".repeat(1025)]) {
      expect(verifyInvoiceAccessToken(invalid, "invoice-a", now)).toBeNull();
    }
  });
  it("expires at the boundary and fails closed if the signing key is missing", () => {
    const token = createInvoiceAccessToken("invoice-a", "account-a", now);
    expect(verifyInvoiceAccessToken(token, "invoice-a", now + INVOICE_LINK_DAYS * 86400000)).toBeNull();
    vi.stubEnv("AUTH_SECRET", "");
    expect(verifyInvoiceAccessToken(token, "invoice-a", now)).toBeNull();
    expect(() => createInvoiceAccessToken("invoice-a", "account-a", now)).toThrow();
  });
});

describe("session credential revocation", () => {
  it("invalidates old sessions after a password or 2FA change", () => {
    const fingerprint = credentialFingerprint("old-password-hash");
    expect(credentialsUnchanged(fingerprint, "old-password-hash")).toBe(true);
    expect(credentialsUnchanged(fingerprint, "new-password-hash")).toBe(false);
    expect(credentialsUnchanged(fingerprint, "old-password-hash", new Date(now))).toBe(false);
    expect(credentialsUnchanged(undefined, "old-password-hash")).toBe(false);
  });
});
