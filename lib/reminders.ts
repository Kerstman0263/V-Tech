import { sendEmail } from "@/lib/email";
import { createInvoicePayment, invoicePaymentsEnabled } from "@/lib/mollie";
import { formatMoney } from "@/lib/utils";
import { escapeHtml, renderKlantEmail } from "@/lib/email-templates";
import { mailDate, paymentTermsHtml } from "@/lib/invoice-send";

interface ReminderInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  dueDate: Date | null;
}

/**
 * Stuurt een betaalherinnering naar de klant, namens de ondernemer. Altijd met
 * de bankgegevens uit de factuurinstellingen; alleen met MOLLIE_INVOICE_PAYMENTS=1
 * ook een online betaallink.
 *
 * Geeft `false` terug als er geen klant-e-mail is (niets verstuurd).
 */
export async function sendInvoiceReminder(opts: {
  invoice: ReminderInvoice;
  customerName: string;
  customerEmail: string | null;
  /** Naam van de ondernemer (gebruik senderName: nooit "Saldova"). */
  companyName: string;
  companyLogo?: string | null;
  paymentTerms?: string | null;
  reminderNumber?: number; // de hoeveelste herinnering (1, 2, ...)
  /** E-mail van de eigenaar: replies gaan naar hem/haar, niet naar Saldova. */
  replyTo?: string | null;
}): Promise<boolean> {
  const { invoice, customerName, customerEmail, companyName, companyLogo, paymentTerms, reminderNumber, replyTo } = opts;
  if (!customerEmail) return false;

  const amount = formatMoney(invoice.total, "nl", invoice.currency);

  let payUrl: string | null = null;
  if (invoicePaymentsEnabled()) {
    try {
      payUrl = await createInvoicePayment(invoice);
    } catch {
      payUrl = null;
    }
  }

  const intro =
    reminderNumber && reminderNumber > 1
      ? `Dit is herinnering ${reminderNumber} voor factuur <strong>${escapeHtml(invoice.invoiceNumber)}</strong>, die nog openstaat.`
      : `Volgens onze administratie is factuur <strong>${escapeHtml(invoice.invoiceNumber)}</strong> nog niet betaald.`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">${label}</td><td style="padding:4px 0;color:#111827"><strong>${value}</strong></td></tr>`;

  await sendEmail({
    required: true,
    replyTo: replyTo ?? undefined,
    fromName: `${companyName} via Saldova`,
    to: customerEmail,
    subject: `Herinnering: factuur ${invoice.invoiceNumber} van ${companyName}`,
    html: renderKlantEmail({
      companyName,
      companyLogo,
      heading: "Betaalherinnering",
      preheader: `Factuur ${invoice.invoiceNumber} · ${amount}`,
      bodyHtml: `
        <p style="margin:0 0 12px">Beste ${escapeHtml(customerName)},</p>
        <p style="margin:0 0 12px">${intro}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:15px">
          ${row("Factuurnummer", escapeHtml(invoice.invoiceNumber))}
          ${row("Bedrag", escapeHtml(amount))}
          ${invoice.dueDate ? row("Vervaldatum", escapeHtml(mailDate(invoice.dueDate))) : ""}
        </table>
        ${paymentTermsHtml(paymentTerms, invoice.invoiceNumber)}
        ${payUrl ? `<p style="margin:0 0 12px;color:#374151">Liever meteen online betalen? Dat kan via <a href="${escapeHtml(payUrl)}" style="color:#111827">deze betaallink</a>.</p>` : ""}
        <p style="margin:0 0 12px">Heb je al betaald? Dan kun je deze herinnering als niet verzonden beschouwen.</p>
        <p style="margin:20px 0 0">Met vriendelijke groet,<br>${escapeHtml(companyName)}</p>`,
    }),
  });
  return true;
}
