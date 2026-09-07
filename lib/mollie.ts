import createMollieClient, {
  type MollieClient,
  SequenceType,
} from "@mollie/api-client";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import type { Plan } from "@prisma/client";
import { createHash } from "node:crypto";
import { HttpError } from "@/lib/http-error";
import { paymentPeriodEnd } from "@/lib/payment-verification";

/**
 * Volledige Mollie-integratie voor maandelijks terugkerende incasso.
 *
 * Flow:
 *  1. createMollieCustomer()  -> Mollie customer + opslaan mollieCustomerId
 *  2. createFirstPayment()    -> "first" payment (mandaat ophalen via iDEAL/CC)
 *  3. webhook (paid)          -> activateRecurringSubscription() maakt de
 *                                terugkerende subscription aan + zet status ACTIVE
 *  4. webhook (recurring)     -> verlengt currentPeriodEnd
 */

let client: MollieClient | undefined;

export function mollie(): MollieClient {
  if (!client) {
    const apiKey = process.env.MOLLIE_API_KEY;
    if (!apiKey) throw new HttpError(503, "Online betalen is nog niet ingesteld. Probeer het later opnieuw.");
    client = createMollieClient({ apiKey });
  }
  return client;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function webhookUrl(): string {
  return (
    process.env.MOLLIE_WEBHOOK_URL ?? `${appUrl()}/api/webhooks/mollie`
  );
}

/**
 * Maakt (indien nodig) een Mollie-customer aan en slaat het id op.
 * Idempotent: bestaat er al een mollieCustomerId, dan wordt die hergebruikt.
 */
export async function ensureMollieCustomer(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { subscription: true, company: true },
  });
  if (!user) throw new Error("User niet gevonden");

  if (user.subscription?.mollieCustomerId) {
    return user.subscription.mollieCustomerId;
  }

  const customer = await mollie().customers.create({
    name: user.company?.name ?? user.name ?? user.email,
    email: user.email,
    metadata: { userId },
    idempotencyKey: `customer-${userId}`,
  });

  await db.subscription.upsert({
    where: { userId },
    update: { mollieCustomerId: customer.id },
    create: { userId, mollieCustomerId: customer.id, status: "TRIALING" },
  });

  return customer.id;
}

/**
 * Start de eerste betaling om een mandaat te verkrijgen (sequenceType "first").
 * Geeft de checkout-URL terug waar de gebruiker naartoe moet.
 */
export async function createFirstPayment(
  userId: string,
  plan: Plan,
): Promise<{ checkoutUrl: string; paymentId: string }> {
  const existing = await db.subscription.findUnique({ where: { userId } });
  if (existing?.mollieSubscriptionId && existing.status !== "CANCELED") {
    throw new HttpError(409, "Er loopt al een abonnement. Een tweede incasso starten is niet mogelijk.");
  }
  const customerId = await ensureMollieCustomer(userId);
  const planConfig = PLANS[plan];

  if (planConfig.price <= 0) {
    throw new Error("Het gratis plan vereist geen betaling.");
  }

  const payment = await mollie().payments.create({
    amount: {
      currency: "EUR",
      value: planConfig.price.toFixed(2),
    },
    customerId,
    sequenceType: SequenceType.first, // eerste betaling -> levert mandaat op
    description: `Saldova ${plan} abonnement — eerste incasso`,
    redirectUrl: `${appUrl()}/settings?checkout=done`,
    webhookUrl: webhookUrl(),
    metadata: { userId, plan },
    idempotencyKey: `checkout-${userId}-${plan}-${Math.floor(Date.now() / 600_000)}`,
  });

  // The requested plan lives in provider metadata. Access changes only after
  // the payment has been verified by the webhook, never on opening checkout.

  const checkoutUrl = payment.getCheckoutUrl();
  if (!checkoutUrl) throw new Error("Mollie gaf geen checkout-URL terug.");

  return { checkoutUrl, paymentId: payment.id };
}

/**
 * Maakt de terugkerende maandelijkse subscription aan bij Mollie.
 * Wordt aangeroepen vanuit de webhook nadat de eerste betaling 'paid' is.
 */
export async function activateRecurringSubscription(
  userId: string, plan: Plan, paymentId: string, paidAt: string,
): Promise<string> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub?.mollieCustomerId) throw new Error("Missing subscription customer");
  if (sub.mollieSubscriptionId && sub.status !== "CANCELED") return sub.mollieSubscriptionId;
  const periodEnd = paymentPeriodEnd(paidAt);
  const subscription = await mollie().customerSubscriptions.create({
    customerId: sub.mollieCustomerId,
    amount: { currency: "EUR", value: PLANS[plan].price.toFixed(2) },
    interval: "1 month", startDate: periodEnd.toISOString().slice(0, 10),
    description: `Saldova ${plan} maandelijks abonnement`,
    webhookUrl: webhookUrl(), metadata: { userId, plan },
    idempotencyKey: `subscription-${paymentId}`,
  });
  return subscription.id;
}

/**
 * Maakt een eenmalige Mollie-betaling voor een factuur en geeft de
 * checkout-URL terug. De webhook zet de factuur op PAID via metadata.invoiceId.
 */
export async function createInvoicePayment(invoice: {
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
}): Promise<string> {
  if (!Number.isFinite(invoice.total) || invoice.total <= 0) throw new HttpError(422, "Voor deze factuur is geen online betaling nodig.");
  const key = createHash("sha256").update(JSON.stringify([invoice.id, invoice.invoiceNumber, invoice.total.toFixed(2), invoice.currency]) + Math.floor(Date.now() / 86_400_000)).digest("hex");
  const payment = await mollie().payments.create({
    idempotencyKey: `invoice-${key}`,
    amount: { currency: invoice.currency || "EUR", value: invoice.total.toFixed(2) },
    description: `Factuur ${invoice.invoiceNumber}`,
    redirectUrl: `${appUrl()}/payment-return`,
    webhookUrl: webhookUrl(),
    metadata: { invoiceId: invoice.id },
  });
  const url = payment.getCheckoutUrl();
  if (!url) throw new Error("Mollie gaf geen checkout-URL terug.");
  return url;
}

/** Zegt de Mollie-subscription op (per einde periode). */
export async function cancelRecurringSubscription(userId: string): Promise<void> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub?.mollieCustomerId || !sub.mollieSubscriptionId) return;

  await mollie().customerSubscriptions.cancel(sub.mollieSubscriptionId, {
    customerId: sub.mollieCustomerId,
  });

  await db.subscription.update({
    where: { userId },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
}
