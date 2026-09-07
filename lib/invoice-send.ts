import { db } from "@/lib/db";
import { sendEmail, emailConfigured } from "@/lib/email";
import { createInvoicePayment } from "@/lib/mollie";
import { invoicePdfLink } from "@/lib/invoice-access";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type SendInvoiceResult = "sent" | "no_email" | "email_not_configured" | "already_closed" | "not_found";

/**
 * Mailt een factuur naar de klant (met online betaalknop als Mollie is
 * ingesteld, anders de betaalgegevens) en zet DRAFT op SENT.
 * Gedeeld door de handmatige verzendknop en de periodieke facturen.
 */
export async function sendInvoiceEmail(invoiceId: string, accountId: string): Promise<SendInvoiceResult> {
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId, userId: accountId },
    include: {
      customer: { select: { name: true, email: true } },
      user: { select: { email: true, company: { select: { name: true } }, invoiceSettings: { select: { paymentTerms: true } } } },
    },
  });
  if (!inv) return "not_found";
  if (!emailConfigured()) return "email_not_configured";
  if (!inv.customer.email) return "no_email";
  if (inv.status === "PAID" || inv.status === "CANCELED") return "already_closed";

  const company = inv.user.company?.name ?? "Saldova";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";
  const pdfUrl = invoicePdfLink(appUrl, inv.id, accountId);

  // Betaalknop (Mollie) — faalt stil terug naar de betaalgegevens-tekst
  let payUrl: string | null = null;
  if (process.env.MOLLIE_API_KEY) {
    try {
      payUrl = await createInvoicePayment({ id: inv.id, invoiceNumber: inv.invoiceNumber, total: Number(inv.total), currency: inv.currency });
    } catch {
      payUrl = null;
    }
  }
  const paymentTerms = inv.user.invoiceSettings?.paymentTerms ?? null;
  const payBlock = payUrl
    ? `<p style="margin:20px 0"><a href="${payUrl}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Betaal nu online →</a></p>`
    : paymentTerms
      ? `<p style="color:#374151"><strong>Betaalgegevens:</strong><br>${esc(paymentTerms).replace(/\n/g, "<br>")}</p>`
      : "";

  const due = inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null;
  await sendEmail({
    required: true,
    to: inv.customer.email,
    replyTo: inv.user.email,
    fromName: `${company} via Saldova`,
    subject: `Factuur ${inv.invoiceNumber} van ${company}`,
    html: `
      <h2 style="color:#111827">Nieuwe factuur</h2>
      <p>Beste ${esc(inv.customer.name)},</p>
      <p>${esc(company)} heeft factuur <strong>${esc(inv.invoiceNumber)}</strong> voor je klaargezet
      (totaal <strong>€ ${Number(inv.total).toFixed(2)}</strong>${due ? `, te voldoen vóór ${due}` : ""}).</p>
      ${payBlock}
      <p style="color:#6b7280;font-size:14px">Download je factuur via deze persoonlijke link (90 dagen geldig): <a href="${pdfUrl}">${esc(inv.invoiceNumber)}.pdf</a>. Je hoeft geen Saldova-account aan te maken.</p>
    `,
  });

  if (inv.status === "DRAFT") {
    await db.invoice.updateMany({ where: { id: inv.id, userId: accountId, status: "DRAFT" }, data: { status: "SENT" } });
  }
  return "sent";
}
