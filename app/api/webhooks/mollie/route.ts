import { NextResponse } from "next/server";
import { mollie } from "@/lib/mollie";
import { db } from "@/lib/db";

/**
 * POST /api/webhooks/mollie
 *
 * Mollie stuurt bij elke statuswijziging een POST met body `id=<payment_id>`.
 * We mogen de status NOOIT uit de request-body vertrouwen — we halen 'm
 * altijd vers op bij Mollie via de API.
 *
 * Zet deze URL als webhook bij je Mollie-betaling/abonnement
 * (MOLLIE_WEBHOOK_URL in .env).
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const paymentId = form.get("id");
    if (typeof paymentId !== "string") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Haal de echte status op bij Mollie
    const payment = await mollie().payments.get(paymentId);
    const mollieCustomerId = payment.customerId ?? undefined;
    if (!mollieCustomerId) {
      return new NextResponse("OK", { status: 200 });
    }

    // Map Mollie-status -> ons SubStatus
    const sub = await db.subscription.findFirst({ where: { mollieCustomerId } });
    if (sub) {
      const status =
        payment.status === "paid"
          ? "ACTIVE"
          : payment.status === "failed" || payment.status === "expired"
            ? "PAST_DUE"
            : payment.status === "canceled"
              ? "CANCELED"
              : sub.status;

      await db.subscription.update({
        where: { id: sub.id },
        data: { status },
      });
    }

    // Mollie verwacht altijd een 200, anders blijft het opnieuw proberen
    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    console.error("Mollie webhook error:", err);
    // Toch 200 om eindeloze retries bij een bekend probleem te voorkomen,
    // maar log altijd zodat je het kunt onderzoeken.
    return new NextResponse("OK", { status: 200 });
  }
}
