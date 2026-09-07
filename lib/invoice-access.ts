import { createHmac, timingSafeEqual } from "node:crypto";

const DAY = 86_400_000;
export const INVOICE_LINK_DAYS = 90;
function signature(payload: string): Buffer {
  const key = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!key || key.length < 32) throw new Error("Invoice link signing is not configured");
  return createHmac("sha256", key).update(`saldova:invoice-pdf:v1:${payload}`).digest();
}

/** Read-only access to one invoice in one account, valid for at most 90 days. */
export function createInvoiceAccessToken(invoiceId: string, accountId: string, now = Date.now()): string {
  const expires = Math.floor(now / DAY) * DAY + INVOICE_LINK_DAYS * DAY;
  const payload = Buffer.from(JSON.stringify({ invoiceId, accountId, expires })).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyInvoiceAccessToken(token: string, invoiceId: string, now = Date.now()): { accountId: string } | null {
  if (token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  try {
    const actual = Buffer.from(parts[1], "base64url");
    const expected = signature(parts[0]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (data.invoiceId !== invoiceId || typeof data.accountId !== "string" || !data.accountId ||
        !Number.isSafeInteger(data.expires) || data.expires <= now || data.expires > now + INVOICE_LINK_DAYS * DAY) return null;
    return { accountId: data.accountId };
  } catch {
    return null;
  }
}

export function invoicePdfLink(origin: string, invoiceId: string, accountId: string): string {
  const url = new URL(`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`, origin);
  url.searchParams.set("token", createInvoiceAccessToken(invoiceId, accountId));
  return url.toString();
}
