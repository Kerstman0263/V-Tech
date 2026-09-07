import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { mollie, activateRecurringSubscription } from "@/lib/mollie";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { paymentAmountMatches, paymentPeriodEnd } from "@/lib/payment-verification";
import { serializableTransaction } from "@/lib/transaction";
import type { Plan } from "@prisma/client";

/** Legacy Mollie payment notifications contain only an id. Fetch authoritative
 * payment data with the server API key; never trust a submitted paid status. */
export async function POST(req: Request) {
  try {
    const body = await req.text();
    const paymentId = new URLSearchParams(body).get("id");
    if (body.length > 512 || !paymentId || !/^tr_[a-zA-Z0-9]{5,64}$/.test(paymentId)) {
      return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
    }
    const payment = await mollie().payments.get(paymentId);
    const meta = payment.metadata as { userId?: string; plan?: string; invoiceId?: string } | null;
    const refunded = Number(payment.amountRefunded?.value ?? 0) + Number(payment.amountChargedBack?.value ?? 0);
    const eventId = "mollie-" + createHash("sha256").update(JSON.stringify([payment.id, payment.status, refunded])).digest("hex");
    if (await db.auditLog.findUnique({ where: { id: eventId } })) return new NextResponse("OK");
    if (typeof meta?.invoiceId === "string") {
      await serializableTransaction(async (tx) => {
        if (await tx.auditLog.findUnique({ where: { id: eventId } })) return;
        const invoice = await tx.invoice.findUnique({ where: { id: meta.invoiceId } });
        if (!invoice) return;
        if (!paymentAmountMatches(payment.amount, Number(invoice.total), invoice.currency)) throw new Error("Invoice payment mismatch");
        if (payment.status !== "paid") return;
        if (invoice.status !== "CANCELED") {
          const status = refunded > 0 ? (invoice.dueDate && invoice.dueDate < new Date() ? "OVERDUE" : "SENT") : "PAID";
          await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
        }
        await tx.auditLog.create({ data: {
          id: eventId, accountId: invoice.userId, actorName: "Mollie",
          action: refunded > 0 ? "invoice.payment_reversed" : "invoice.payment_received", target: invoice.invoiceNumber,
        } });
      });
      return new NextResponse("OK");
    }
    const sub = typeof meta?.userId === "string"
      ? await db.subscription.findUnique({ where: { userId: meta.userId } })
      : payment.customerId ? await db.subscription.findFirst({ where: { mollieCustomerId: payment.customerId } }) : null;
    if (!sub) return new NextResponse("OK");
    const plan = typeof meta?.plan === "string" && Object.hasOwn(PLANS, meta.plan) ? meta.plan as Plan : null;
    if (!plan || !payment.customerId || payment.customerId !== sub.mollieCustomerId || !paymentAmountMatches(payment.amount, PLANS[plan].price)) {
      throw new Error("Subscription payment mismatch");
    }
    if (payment.sequenceType !== "first" && payment.sequenceType !== "recurring") throw new Error("Unexpected payment sequence");
    if (payment.sequenceType === "recurring" && payment.subscriptionId !== sub.mollieSubscriptionId) throw new Error("Subscription id mismatch");
    if (!["paid", "failed", "expired", "canceled"].includes(payment.status)) return new NextResponse("OK");
    const periodEnd = payment.status === "paid" && payment.paidAt ? paymentPeriodEnd(payment.paidAt) : null;
    if (payment.status === "paid" && !periodEnd) throw new Error("Missing payment timestamp");
    const canceledAfterPayment = sub.canceledAt && new Date(payment.paidAt ?? payment.createdAt) <= sub.canceledAt;
    let subscriptionId = sub.mollieSubscriptionId;
    if (payment.status === "paid" && !refunded && payment.sequenceType === "first" && !canceledAfterPayment && (!sub.currentPeriodEnd || sub.currentPeriodEnd <= periodEnd!)) {
      subscriptionId = await activateRecurringSubscription(sub.userId, plan, payment.id, payment.paidAt!);
    }
    await serializableTransaction(async (tx) => {
      if (await tx.auditLog.findUnique({ where: { id: eventId } })) return;
      const fresh = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      const canceled = fresh.canceledAt && new Date(payment.paidAt ?? payment.createdAt) <= fresh.canceledAt;
      if (periodEnd && !canceled && (!fresh.currentPeriodEnd || fresh.currentPeriodEnd <= periodEnd)) {
        await tx.subscription.update({ where: { id: fresh.id }, data: {
          status: refunded > 0 ? "PAST_DUE" : "ACTIVE", plan, currentPeriodEnd: periodEnd,
          ...(!refunded ? { mollieSubscriptionId: subscriptionId, canceledAt: null } : {}),
        } });
      } else if (!periodEnd && payment.sequenceType === "recurring" && fresh.status !== "CANCELED" && (!fresh.currentPeriodEnd || new Date(payment.createdAt) >= fresh.currentPeriodEnd)) {
        await tx.subscription.update({ where: { id: fresh.id }, data: { status: "PAST_DUE" } });
      }
      await tx.auditLog.create({ data: {
        id: eventId, accountId: sub.userId, actorName: "Mollie", action: "billing.payment_" + payment.status,
        target: payment.id,
      } });
    });
    return new NextResponse("OK");
  } catch (error) {
    console.error("mollie_webhook_failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return new NextResponse("Payment processing temporarily unavailable", { status: 503, headers: { "Retry-After": "60" } });
  }
}
