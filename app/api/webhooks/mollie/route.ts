import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { mollie, activateRecurringSubscription } from "@/lib/mollie";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { isCurrentBillingDate, paymentAmountMatches, paymentPeriodEnd, subscriptionAmountMatches } from "@/lib/payment-verification";
import { serializableTransaction } from "@/lib/transaction";
import { logPlatform } from "@/lib/audit";
import type { Plan } from "@prisma/client";
import { invoicePaymentStatusChange, summarizeInvoicePayments, type InvoicePaymentRow } from "@/lib/invoice-payments";

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
    const refundedOnly = Number(payment.amountRefunded?.value ?? 0);
    const chargedBack = Number(payment.amountChargedBack?.value ?? 0);
    const refunded = refundedOnly + chargedBack;
    const eventId = "mollie-" + createHash("sha256").update(JSON.stringify([payment.id, payment.status, refunded])).digest("hex");
    if (await db.auditLog.findUnique({ where: { id: eventId } })) return new NextResponse("OK");
    if (typeof meta?.invoiceId === "string") {
      await serializableTransaction(async (tx) => {
        if (await tx.auditLog.findUnique({ where: { id: eventId } })) return;
        const invoice = await tx.invoice.findUnique({ where: { id: meta.invoiceId } });
        if (!invoice) return;
        if (!paymentAmountMatches(payment.amount, Number(invoice.total), invoice.currency)) throw new Error("Invoice payment mismatch");
        if (payment.status !== "paid") return;
        // Tel ALLE online betalingen van deze factuur (lib/invoice-payments.ts),
        // niet alleen deze: een kleine terugstorting of een tweede betaling mag
        // een betaalde factuur niet zomaar weer openzetten.
        const total = Number(invoice.total);
        const amount = Number(payment.amount.value);
        const rows = await tx.invoicePayment.findMany({ where: { invoiceId: invoice.id, userId: invoice.userId } });
        const others: InvoicePaymentRow[] = rows.filter((r) => r.id !== payment.id)
          .map((r) => ({ amount: Number(r.amount), refunded: Number(r.refunded), chargedBack: Number(r.chargedBack) }));
        const known = rows.find((r) => r.id === payment.id);
        // Nog niet eerder gezien (bijv. een betaling van vóór deze tabel): dan stond
        // hij tot nu toe volledig.
        const previous: InvoicePaymentRow = known
          ? { amount: Number(known.amount), refunded: Number(known.refunded), chargedBack: Number(known.chargedBack) }
          : { amount, refunded: 0, chargedBack: 0 };
        const current: InvoicePaymentRow = { amount, refunded: refundedOnly, chargedBack };
        const before = summarizeInvoicePayments([...others, previous], total);
        const after = summarizeInvoicePayments([...others, current], total);
        // Wat stond er vóór deze gebeurtenis echt in de tabel? Een nog niet geziene
        // betaling telt daar niet in mee: zo zien we of er nu geld BIJ komt.
        const prior = summarizeInvoicePayments(known ? [...others, previous] : others, total);
        await tx.invoicePayment.upsert({
          where: { id: payment.id },
          create: { id: payment.id, userId: invoice.userId, invoiceId: invoice.id, amount, refunded: refundedOnly, chargedBack, currency: payment.amount.currency },
          update: { amount, refunded: refundedOnly, chargedBack },
        });
        const paidViaBank = !!(await tx.bankTransaction.findFirst({
          where: { userId: invoice.userId, status: "MATCHED", matchedInvoiceId: invoice.id }, select: { id: true },
        }));
        const change = invoicePaymentStatusChange({ status: invoice.status, before, after, paidViaBank });
        if (change === "PAID") {
          // Betaaldatum volgens Mollie (voor de auditfile); ontbreekt die, dan nu.
          const paidAt = payment.paidAt ? new Date(payment.paidAt) : null;
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: paidAt && Number.isFinite(paidAt.getTime()) ? paidAt : new Date() } });
        } else if (change === "REOPEN") {
          const status = invoice.dueDate && invoice.dueDate < new Date() ? "OVERDUE" : "SENT";
          await tx.invoice.update({ where: { id: invoice.id }, data: { status, paidAt: null } });
        }
        // Eén logregel per gebeurtenis (id = eventId, voor de idempotentie).
        // "payment_received" en "payment_reversed" gebruikt de bankkoppeling om te
        // zien of de factuur online betaald is (lib/bank-matching.ts isPaidOnline).
        // Nog betaald ondanks een terugstorting (coulance, of een dubbele betaling
        // die is teruggestort): eigen logregel, zodat de factuur betaald blijft.
        const action = !after.settled
          ? "invoice.payment_reversed"
          : before.settled && refunded > 0 ? "invoice.payment_refunded_still_paid" : "invoice.payment_received";
        await tx.auditLog.create({ data: {
          id: eventId, accountId: invoice.userId, actorName: "Mollie", action, target: invoice.invoiceNumber,
        } });
        if (after.overpaid > prior.overpaid) {
          // Dubbel betaald: de factuur blijft betaald, de ondernemer ziet het in
          // Activiteit en kan het teveel ontvangen bedrag terugstorten. Alleen als
          // het teveel ontvangen bedrag nu groter wordt: een latere terugstorting
          // of terugboeking geeft geen nieuwe melding.
          await tx.auditLog.create({ data: {
            id: `${eventId}-dup`, accountId: invoice.userId, actorName: "Mollie", action: "invoice.payment_duplicate",
            target: `${invoice.invoiceNumber}: ${after.overpaid.toFixed(2)} ${invoice.currency} te veel ontvangen`,
          } });
        }
        if (invoice.creditedAt && !known && refunded === 0) {
          // Een nieuwe betaling op een factuur die al gecrediteerd is (bijvoorbeeld
          // via een betaallink van vóór het crediteren): er staat niets meer open,
          // dus dit bedrag moet terug naar de klant. Eén melding per betaling: de
          // eerste keer dat we hem zien. Een eerste melding die al een terugstorting
          // bevat, is een oude betaling van vóór de betalingentabel; die was al bekend.
          await tx.auditLog.create({ data: {
            id: `${eventId}-credited`, accountId: invoice.userId, actorName: "Mollie", action: "invoice.paid_after_credit",
            target: `${invoice.invoiceNumber}: ${amount.toFixed(2)} ${invoice.currency} ontvangen na het crediteren, betaal dit terug`,
          } });
        }
      });
      return new NextResponse("OK");
    }
    const sub = typeof meta?.userId === "string"
      ? await db.subscription.findUnique({ where: { userId: meta.userId } })
      : payment.customerId ? await db.subscription.findFirst({ where: { mollieCustomerId: payment.customerId } }) : null;
    if (!sub) {
      // Betaling voor een klant die we niet (meer) kennen, bijvoorbeeld na het
      // verwijderen van een account. Antwoord blijft 200 (anders blijft Mollie
      // het opnieuw proberen), maar dit moet iemand nakijken: mogelijk loopt er
      // nog een incasso die moet worden opgezegd of terugbetaald.
      console.warn("mollie_webhook_unknown_customer", {
        paymentId: payment.id, customerId: payment.customerId ?? null,
        status: payment.status, sequenceType: payment.sequenceType ?? null,
      });
      try {
        logPlatform({ name: "Mollie" }, "billing.payment_unknown_customer",
          `betaling ${payment.id} (${payment.status}) voor onbekende Mollie-klant ${payment.customerId ?? "-"}`);
      } catch { /* loggen mag het antwoord nooit veranderen */ }
      return new NextResponse("OK");
    }
    const plan = typeof meta?.plan === "string" && Object.hasOwn(PLANS, meta.plan) ? meta.plan as Plan : null;
    if (!plan || !payment.customerId || payment.customerId !== sub.mollieCustomerId || !subscriptionAmountMatches(payment.amount, plan)) {
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
      } else if (!periodEnd && payment.sequenceType === "recurring" && fresh.status !== "CANCELED" && isCurrentBillingDate(payment.createdAt, fresh.currentPeriodEnd)) {
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
