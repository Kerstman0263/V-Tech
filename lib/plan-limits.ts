import { db } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { PLANS } from "@/lib/plans";
import { effectivePlan, hasSoloTrial } from "@/lib/subscription";
import type { AccountType, Plan, Prisma, SubStatus } from "@prisma/client";

type CustomerLimitClient = Pick<Prisma.TransactionClient, "subscription" | "customer">;

/**
 * Plan-limieten afdwingen (zie lib/plans.ts -> limits). Alleen bij het
 * aanmaken van iets nieuws: bestaande klanten en facturen blijven altijd
 * bruikbaar, en creditfacturen of door de klant geaccepteerde offertes
 * worden nooit geblokkeerd.
 */

async function subscriptionOf(accountId: string, client: Pick<Prisma.TransactionClient, "subscription"> = db) {
  const sub = await client.subscription.findUnique({
    where: { userId: accountId },
    select: { plan: true, status: true, trialEndsAt: true, user: { select: { company: { select: { accountType: true } } } } },
  });
  return { sub, accountType: sub?.user?.company?.accountType ?? "ZZP" } as const;
}

/** Effectief plan: tijdens een Groei-proef Groei, daarna vanzelf weer Gratis (lib/subscription.ts). */
async function planOf(accountId: string, client: CustomerLimitClient = db, now = new Date()) {
  const { sub, accountType } = await subscriptionOf(accountId, client);
  return PLANS[effectivePlan(sub, accountType, now)];
}

/**
 * Vanaf wanneer tellen de facturen van deze maand mee voor de gratis limiet?
 * Normaal vanaf de 1e van de maand. Is er deze maand een Groei-proef afgelopen,
 * dan pas vanaf het einde van de proef: facturen uit de proef blijven gewoon
 * bestaan, alleen nieuwe facturen gaan volgens de gratis limiet. Puur.
 */
export function invoiceCountStart(
  monthStart: Date,
  sub: { plan: Plan; status?: SubStatus; trialEndsAt?: Date | null } | null | undefined,
  accountType: AccountType | null | undefined,
  now: Date = new Date(),
): Date {
  if (!sub || !hasSoloTrial(sub, accountType)) return monthStart;
  const end = sub.trialEndsAt!;
  return end <= now && end > monthStart ? end : monthStart;
}

export const PLAN_LIMIT_CODE = "plan_limit";

/** Hoeveel klanten mogen er nog bij? null = onbeperkt. */
export async function remainingCustomerSlots(accountId: string, client: CustomerLimitClient = db): Promise<number | null> {
  const plan = await planOf(accountId, client);
  const limit = plan.limits.customers;
  if (limit === null) return null;
  const used = await client.customer.count({ where: { userId: accountId } });
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
  const { sub, accountType } = await subscriptionOf(accountId);
  const plan = PLANS[effectivePlan(sub, accountType, now)];
  const limit = plan.limits.invoicesPerMonth;
  if (limit === null) return;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const countFrom = invoiceCountStart(monthStart, sub, accountType, now);
  // Creditfacturen (negatief totaal) tellen niet mee.
  const used = await db.invoice.count({ where: { userId: accountId, createdAt: { gte: countFrom }, total: { gte: 0 } } });
  if (used >= limit) {
    throw new HttpError(402, `Je hebt deze maand al ${limit} facturen gemaakt, het maximum van het Gratis-plan. Upgrade naar Groei voor onbeperkt factureren.`);
  }
}
