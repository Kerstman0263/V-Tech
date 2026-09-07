import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { createInvoiceForAccount } from "@/lib/invoice-create";
import { sendInvoiceEmail } from "@/lib/invoice-send";
import { createInvoicePayment } from "@/lib/mollie";
import { logAccount } from "@/lib/audit";

/**
 * POST /api/public/quotes/:token/respond — publiek (geen login).
 * Body: { action: "accept", signatureName, signatureData } | { action: "decline", reason }.
 *
 * Accepteren = digitaal ondertekenen: naam + getekende handtekening (PNG) +
 * IP + tijdstip worden vastgelegd. Staat er een aanbetaling op de offerte,
 * dan wordt direct een aanbetalingsfactuur aangemaakt en gemaild, met — als
 * Mollie actief is — een iDEAL-betaallink waar de klant meteen naartoe kan.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(req);
  const limited = rateLimitResponse(`quote-respond:${token}:${ip}`, 10, 60 * 60 * 1000);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Invalid action" }, { status: 422 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (action === "decline" && reason.length === 0) {
    return NextResponse.json({ error: "reason_required" }, { status: 422 });
  }
  const signatureName = typeof body.signatureName === "string" ? body.signatureName.trim().slice(0, 120) : "";
  const signatureData = typeof body.signatureData === "string" && body.signatureData.startsWith("data:image/png;base64,") && body.signatureData.length < 400_000 ? body.signatureData : "";
  if (action === "accept" && (!signatureName || !signatureData)) {
    return NextResponse.json({ error: "signature_required" }, { status: 422 });
  }

  const quote = await db.quote.findUnique({
    where: { publicToken: token },
    select: {
      id: true, status: true, validUntil: true, userId: true, createdById: true, customerId: true, quoteNumber: true,
      subtotal: true, depositPercent: true, depositInvoiceId: true, currency: true,
      lineItems: { select: { vatRate: true, lineTotal: true } },
    },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verlopen? Dan automatisch op EXPIRED zetten en niets meer toestaan.
  if ((quote.status === "SENT" || quote.status === "DRAFT") && quote.validUntil && quote.validUntil < new Date()) {
    await db.quote.update({ where: { id: quote.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "expired", status: "EXPIRED" }, { status: 409 });
  }
  if (quote.status !== "SENT" && quote.status !== "DRAFT") {
    return NextResponse.json({ error: "already_handled", status: quote.status }, { status: 409 });
  }

  if (action === "decline") {
    const updated = await db.quote.update({ where: { id: quote.id }, data: { status: "DECLINED", declineReason: reason }, select: { status: true } });
    logAccount(quote.userId, { name: "Klant (offerte-link)" }, "quote.declined", `${quote.quoteNumber}: ${reason.slice(0, 120)}`);
    return NextResponse.json({ ok: true, status: updated.status });
  }

  const updated = await db.quote.update({
    where: { id: quote.id },
    data: { status: "ACCEPTED", acceptedAt: new Date(), signatureName, signatureData, signedIp: ip },
    select: { status: true },
  });
  logAccount(quote.userId, { name: "Klant (offerte-link)" }, "quote.signed", `${quote.quoteNumber} ondertekend door ${signatureName}`);

  // Aanbetaling: factuur voor X% van het offertebedrag (excl. btw) met het dominante btw-tarief.
  let deposit: { invoiceNumber: string; amount: number; checkoutUrl: string | null } | null = null;
  if (quote.depositPercent > 0 && !quote.depositInvoiceId) {
    try {
      const subtotal = Number(quote.subtotal);
      const netDeposit = Math.round(subtotal * quote.depositPercent) / 100;
      // Dominant btw-tarief = tarief van de regels met de grootste som
      const byRate = new Map<number, number>();
      for (const li of quote.lineItems) byRate.set(Number(li.vatRate), (byRate.get(Number(li.vatRate)) ?? 0) + Number(li.lineTotal));
      const vatRate = [...byRate.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 21;
      const dueDate = new Date(Date.now() + 7 * 86_400_000);
      const invoice = await createInvoiceForAccount({
        accountId: quote.userId,
        createdById: quote.createdById,
        customerId: quote.customerId,
        lineItems: [{ description: `Aanbetaling ${quote.depositPercent}% — offerte ${quote.quoteNumber}`, quantity: 1, unitPrice: netDeposit, vatRate }],
        notes: `Aanbetaling op offerte ${quote.quoteNumber}, digitaal ondertekend door ${signatureName}. Het restant volgt op de eindfactuur.`,
        dueDate,
      });
      await db.quote.update({ where: { id: quote.id }, data: { depositInvoiceId: invoice.id } });
      // Mailen (zet op SENT); mislukken mag de acceptatie niet blokkeren
      await sendInvoiceEmail(invoice.id, quote.userId).catch(() => null);
      // Zonder mailconfiguratie blijft de factuur anders concept; de klant heeft hem via de
      // offerte-flow al gezien, dus altijd "verzonden" (telt mee als openstaand/debiteur).
      await db.invoice.updateMany({ where: { id: invoice.id, status: "DRAFT" }, data: { status: "SENT" } });
      let checkoutUrl: string | null = null;
      try {
        checkoutUrl = await createInvoicePayment({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: Number(invoice.total), currency: quote.currency });
      } catch {
        checkoutUrl = null; // Mollie nog niet live: klant betaalt via de gemailde factuur
      }
      deposit = { invoiceNumber: invoice.invoiceNumber, amount: Number(invoice.total), checkoutUrl };
      logAccount(quote.userId, { name: "Saldova (automatisch)" }, "quote.deposit_invoice", `${invoice.invoiceNumber} (${quote.depositPercent}% van ${quote.quoteNumber})`);
    } catch (err) {
      console.error("Aanbetalingsfactuur mislukt", err);
    }
  }

  return NextResponse.json({ ok: true, status: updated.status, deposit });
}
