import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { InvoiceRuleError } from "@/lib/invoice-rule-error";
import { prepareIssue } from "@/lib/invoice-snapshot";
import { sendInvoiceEmail } from "@/lib/invoice-send";
import { createInvoicePayment, invoicePaymentsEnabled } from "@/lib/mollie";
import { serializableTransaction } from "@/lib/transaction";
import { depositLines } from "@/lib/quote-invoice";
import { logAccount } from "@/lib/audit";
import { missingSenderFields } from "@/lib/invoice-sender";
import { invoicePdfLink } from "@/lib/invoice-access";
import { depositDelivery } from "@/lib/quote-invoice";

/**
 * POST /api/public/quotes/:token/respond — publiek (geen login).
 * Body: { action: "accept", signatureName, signatureData } | { action: "decline", reason }.
 *
 * Accepteren = digitaal ondertekenen: naam + getekende handtekening (PNG) +
 * IP + tijdstip worden vastgelegd. Staat er een aanbetaling op de offerte,
 * dan wordt in dezelfde transactie een aanbetalingsfactuur aangemaakt (per
 * btw-tarief een regel) en daarna gemaild met de bankgegevens van de
 * ondernemer. Online betalen staat achter MOLLIE_INVOICE_PAYMENTS=1.
 *
 * De aanbetalingsfactuur wordt alleen meteen uitgereikt (SENT) als de
 * verplichte afzendergegevens compleet zijn en de btw-regels kloppen. Anders
 * blijft hij een concept: de ondernemer vult zijn gegevens aan en verstuurt hem
 * zelf. De klant krijgt te zien wat er echt gebeurde (gemaild, klaar om te
 * downloaden, of volgt nog).
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
      depositPercent: true, currency: true,
    },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verlopen? Dan automatisch op EXPIRED zetten en niets meer toestaan.
  const now = new Date();
  if ((quote.status === "SENT" || quote.status === "DRAFT") && quote.validUntil && quote.validUntil < now) {
    await db.quote.updateMany({ where: { id: quote.id, status: { in: ["SENT", "DRAFT"] } }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "expired", status: "EXPIRED" }, { status: 409 });
  }
  if (quote.status !== "SENT" && quote.status !== "DRAFT") {
    return NextResponse.json({ error: "already_handled", status: quote.status }, { status: 409 });
  }
  const alreadyHandled = async () => {
    const fresh = await db.quote.findUnique({ where: { id: quote.id }, select: { status: true } });
    return NextResponse.json({ error: "already_handled", status: fresh?.status ?? quote.status }, { status: 409 });
  };

  if (action === "decline") {
    // Atomair: alleen een openstaande offerte kan worden afgewezen.
    const claimed = await db.quote.updateMany({
      where: { id: quote.id, status: { in: ["SENT", "DRAFT"] } },
      data: { status: "DECLINED", declineReason: reason },
    });
    if (claimed.count !== 1) return alreadyHandled();
    logAccount(quote.userId, { name: "Klant (offerte-link)" }, "quote.declined", `${quote.quoteNumber}: ${reason.slice(0, 120)}`);
    return NextResponse.json({ ok: true, status: "DECLINED" });
  }

  if (quote.depositPercent > 0) await getOrCreateInvoiceSettings(quote.userId);

  // Akkoord + aanbetalingsfactuur in één transactie: dubbelklikken of twee
  // tabbladen leveren nooit twee acceptaties of twee aanbetalingen op.
  let result: { accepted: boolean; deposit: { id: string; invoiceNumber: string; total: number; issued: boolean } | null; depositBlocked?: string };
  try {
    result = await serializableTransaction(async (tx) => {
      const claimed = await tx.quote.updateMany({
        where: { id: quote.id, status: { in: ["SENT", "DRAFT"] } },
        data: { status: "ACCEPTED", acceptedAt: new Date(), signatureName, signatureData, signedIp: ip },
      });
      if (claimed.count !== 1) return { accepted: false, deposit: null };
      if (quote.depositPercent <= 0) return { accepted: true, deposit: null };

      const owned = await tx.quoteLineItem.findMany({
        where: { quoteId: quote.id, clientAdded: false },
        select: { vatRate: true, lineTotal: true },
      });
      const lineItems = depositLines(owned, quote.depositPercent, quote.quoteNumber);
      if (lineItems.length === 0) return { accepted: true, deposit: null };

      let invoice: Awaited<ReturnType<typeof createInvoiceInTransaction>>;
      try {
        invoice = await createInvoiceInTransaction(tx, {
          accountId: quote.userId,
          createdById: quote.createdById,
          customerId: quote.customerId,
          currency: quote.currency,
          lineItems,
          notes: `Aanbetaling op offerte ${quote.quoteNumber}, digitaal ondertekend door ${signatureName}. Het restant volgt op de eindfactuur.`,
          dueDate: new Date(Date.now() + 7 * 86_400_000),
        });
      } catch (err) {
        // Btw- of KOR-regel (bijv. de KOR staat inmiddels aan en de offerte heeft
        // btw): de klant kan wel akkoord geven, de ondernemer maakt de
        // aanbetalingsfactuur zelf. Er is dan nog niets geschreven voor de factuur.
        if (err instanceof InvoiceRuleError) return { accepted: true, deposit: null, depositBlocked: err.code };
        throw err;
      }
      // De klant heeft de aanbetaling via de offerte al gezien: meteen uitgereikt,
      // met de gegevens van dit moment vastgezet. Maar alleen als de factuur
      // geldig is: ontbreken verplichte afzendergegevens (art. 35a Wet OB) of
      // klopt een btw-regel niet, dan blijft hij een concept en gaat er niets weg.
      const company = await tx.company.findUnique({ where: { userId: quote.userId } });
      const settings = await tx.invoiceSettings.findUnique({ where: { userId: quote.userId }, select: { korEnabled: true } });
      let issued = false;
      if (missingSenderFields(company, settings?.korEnabled ?? false).length === 0) {
        const issue = await prepareIssue(tx, quote.userId, invoice.id);
        if (!issue.problem) {
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: "SENT", ...(issue.snapshot ? { snapshot: issue.snapshot } : {}) } });
          issued = true;
        }
      }
      const linked = await tx.quote.updateMany({
        where: { id: quote.id, depositInvoiceId: null },
        data: { depositInvoiceId: invoice.id },
      });
      if (linked.count !== 1) throw new Error("Deposit invoice already linked");
      return { accepted: true, deposit: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: Number(invoice.total), issued } };
    });
  } catch (err) {
    console.error("quote_accept_failed", { type: err instanceof Error ? err.name : "UnknownError" });
    return NextResponse.json({ error: "accept_failed" }, { status: 500 });
  }
  if (!result.accepted) return alreadyHandled();
  logAccount(quote.userId, { name: "Klant (offerte-link)" }, "quote.signed", `${quote.quoteNumber} ondertekend door ${signatureName}`);
  if (result.depositBlocked) {
    logAccount(quote.userId, { name: "Saldova (automatisch)" }, "quote.deposit_blocked", `${quote.quoteNumber} (${result.depositBlocked})`);
  }

  let deposit: { invoiceNumber: string; amount: number; checkoutUrl: string | null; delivery: "mailed" | "ready" | "pending"; pdfUrl: string | null } | null = null;
  if (result.deposit) {
    const { id: invoiceId, invoiceNumber, total, issued } = result.deposit;
    logAccount(quote.userId, { name: "Saldova (automatisch)" }, "quote.deposit_invoice", `${invoiceNumber} (${quote.depositPercent}% van ${quote.quoteNumber})`);
    if (!issued) {
      // Nog een concept (gegevens ontbreken of een btw-regel klopt niet): niets
      // gemaild, geen betaallink. De ondernemer ziet in Activiteit waarom.
      logAccount(quote.userId, { name: "Saldova (automatisch)" }, "invoice.send_blocked_sender", invoiceNumber);
      return NextResponse.json({ ok: true, status: "ACCEPTED", deposit: { invoiceNumber, amount: total, checkoutUrl: null, delivery: "pending", pdfUrl: null } });
    }
    // Mailen mag de acceptatie niet blokkeren.
    const mailed = await sendInvoiceEmail(invoiceId, quote.userId).catch(() => null);
    const delivery = depositDelivery(issued, mailed);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";
    // Niet gemaild (geen e-mailadres, mail staat uit of mislukte): de klant kan
    // de uitgereikte factuur hier meteen downloaden.
    const pdfUrl = delivery === "ready" ? invoicePdfLink(appUrl, invoiceId, quote.userId) : null;
    let checkoutUrl: string | null = null;
    if (invoicePaymentsEnabled()) {
      try {
        checkoutUrl = await createInvoicePayment({ id: invoiceId, invoiceNumber, total, currency: quote.currency });
      } catch {
        checkoutUrl = null; // de klant betaalt via de bankgegevens in de gemailde factuur
      }
    }
    deposit = { invoiceNumber, amount: total, checkoutUrl, delivery, pdfUrl };
  }

  return NextResponse.json({ ok: true, status: "ACCEPTED", deposit });
}
