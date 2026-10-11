import { db } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { PLANS } from "@/lib/plans";

/**
 * Plan-limieten afdwingen (zie lib/plans.ts -> limits). Alleen bij het
 * aanmaken van iets nieuws: bestaande klanten en facturen blijven altijd
 * bruikbaar, en creditfacturen of door de klant geaccepteerde offertes
 * worden nooit geblokkeerd.
 */

async function planOf(accountId: string) {
  const sub = await db.subscription.findUnique({ where: { userId: accountId }, select: { plan: true } });
  return PLANS[sub?.plan ?? "FREE"];
}

export const PLAN_LIMIT_CODE = "plan_limit";

/** Hoeveel klanten mogen er nog bij? null = onbeperkt. */
export async function remainingCustomerSlots(accountId: string): Promise<number | null> {
  const plan = await planOf(accountId);
  const limit = plan.limits.customers;
  if (limit === null) return null;
  const used = await db.customer.count({ where: { userId: accountId } });
  return Math.max(0, limit - used);
}

export async function assertCanAddCustomers(accountId: string, adding = 1): Promise<void> {
  const remaining = await remainingCustomerSlots(accountId);
  if (remaining !== null && adding > remaining) {
    const { limits } = await planOf(accountId);
    throw new HttpError(402, `Je Gratis-plan heeft ruimte voor ${limits.customers} klanten. Upgrade naar Groei voor onbeperkt klanten.`);
  }
}

/** Facturen per kalendermaand (Europe/Amsterdam is hier niet nodig: een dag speling is acceptabel). */
export async function assertCanCreateInvoice(accountId: string, now = new Date()): Promise<void> {
  const plan = await planOf(accountId);
  const limit = plan.limits.invoicesPerMonth;
  if (limit === null) return;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Creditfacturen (negatief totaal) tellen niet mee.
  const used = await db.invoice.count({ where: { userId: accountId, createdAt: { gte: monthStart }, total: { gte: 0 } } });
  if (used >= limit) {
    throw new HttpError(402, `Je hebt deze maand al ${limit} facturen gemaakt, het maximum van het Gratis-plan. Upgrade naar Groei voor onbeperkt factureren.`);
  }
}
