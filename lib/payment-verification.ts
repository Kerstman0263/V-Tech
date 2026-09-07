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
