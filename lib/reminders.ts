import { sendEmail } from "@/lib/email";
import { createInvoicePayment } from "@/lib/mollie";
import { formatMoney } from "@/lib/utils";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface ReminderInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  dueDate: Date | null;
}

/**
 * Stuurt een betaalherinnering naar de klant. NL-tekst (consistent met de
 * support-mails). Voegt een Mollie-betaallink toe als MOLLIE_API_KEY gezet is,
 * anders de betaalinstructies/IBAN uit de factuurinstellingen.
 *
 * Geeft `false` terug als er geen klant-e-mail is (niets verstuurd).
 */
export async function sendInvoiceReminder(opts: {
  invoice: ReminderInvoice;
  customerName: string;
  customerEmail: string | null;
  companyName: string;
  paymentTerms?: string | null;
  reminderNumber?: number; // de hoeveelste herinnering (1, 2, ...)
  /** E-mail van de eigenaar: replies gaan naar hem/haar, niet naar Saldova. */
  replyTo?: string | null;
}): Promise<boolean> {
  const { invoice, customerName, customerEmail, companyName, paymentTerms, reminderNumber, replyTo } = opts;
  if (!customerEmail) return false;

  const amount = formatMoney(invoice.total, "nl", invoice.currency);
  const due = invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null;

  // Optionele Mollie-betaallink (alleen als er een echte API-key is)
  let payUrl: string | null = null;
  if (process.env.MOLLIE_API_KEY) {
    try {
      payUrl = await createInvoicePayment(invoice);
    } catch {
      payUrl = null;
    }
  }

  const payBlock = payUrl
    ? `<p style="margin:20px 0"><a href="${payUrl}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Betaal nu online →</a></p>`
    : paymentTerms
      ? `<p style="color:#374151"><strong>Betaalgegevens:</strong><br>${escapeHtml(paymentTerms).replace(/\n/g, "<br>")}</p>`
      : "";

  const intro =
    reminderNumber && reminderNumber > 1
      ? `Dit is herinnering ${reminderNumber} voor onderstaande factuur, die nog openstaat.`
      : `We zien dat factuur <strong>${escapeHtml(invoice.invoiceNumber)}</strong> nog niet betaald is.`;

  await sendEmail({
    required: true,
    replyTo: replyTo ?? undefined,
    fromName: `${companyName} via Saldova`,
    to: customerEmail,
    subject: `Herinnering: factuur ${invoice.invoiceNumber} van ${companyName}`,
    html: `
      <h2 style="color:#111827">Betaalherinnering</h2>
      <p>Beste ${escapeHtml(customerName)},</p>
      <p>${intro}</p>
      <table style="margin:16px 0;color:#374151">
        <tr><td style="padding:2px 12px 2px 0">Factuurnummer</td><td><strong>${escapeHtml(invoice.invoiceNumber)}</strong></td></tr>
        <tr><td style="padding:2px 12px 2px 0">Bedrag</td><td><strong>${amount}</strong></td></tr>
        ${due ? `<tr><td style="padding:2px 12px 2px 0">Vervaldatum</td><td>${due}</td></tr>` : ""}
      </table>
      <p>Heb je de betaling al gedaan? Dan kun je deze herinnering als niet verzonden beschouwen.</p>
      ${payBlock}
      <p style="margin-top:24px;color:#6b7280">Met vriendelijke groet,<br>${escapeHtml(companyName)}</p>
      <p style="color:#9ca3af;font-size:12px">Verstuurd via Saldova · ${appUrl()}</p>
    `,
  });
  return true;
}
