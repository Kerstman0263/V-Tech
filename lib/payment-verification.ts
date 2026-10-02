import { toCents } from "@/lib/money";

export function paymentAmountMatches(amount: { value: string; currency: string }, expected: number, currency = "EUR") {
  if (!/^\d+\.\d{2}$/.test(amount.value) || !Number.isFinite(expected) || expected <= 0) return false;
  return amount.currency === currency && toCents(Number(amount.value)) === toCents(expected);
}

/** Based on the provider's paidAt, never the time of a webhook retry. */
export function paymentPeriodEnd(paidAt: string): Date {
  const date = new Date(paidAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid payment timestamp");
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
}

/** Mollie schedules subscriptions by calendar date, without a time of day. */
export function isCurrentBillingDate(createdAt: string, currentPeriodEnd: Date | null): boolean {
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime())) throw new Error("Invalid payment creation timestamp");
  return !currentPeriodEnd || created.toISOString().slice(0, 10) >= currentPeriodEnd.toISOString().slice(0, 10);
}
