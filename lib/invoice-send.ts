import { db } from "@/lib/db";
import { sendEmail, emailConfigured } from "@/lib/email";
import { createInvoicePayment, invoicePaymentsEnabled } from "@/lib/mollie";
import { invoicePdfLink } from "@/lib/invoice-access";
import { escapeHtml, klantButton, renderKlantEmail, senderName } from "@/lib/email-templates";
import { formatMoney } from "@/lib/utils";
import { missingSenderFields } from "@/lib/invoice-sender";
import type { Prisma } from "@prisma/client";
import { isCreditNote, markOriginalCredited } from "@/lib/invoice-credit";
import { issueProblemFor, issueSnapshotFor, liveSource, parseInvoiceSnapshot, partiesInclude, type InvoiceSnapshot } from "@/lib/invoice-snapshot";

export type SendInvoiceResult = "sent" | "no_email" | "email_not_configured" | "already_closed" | "not_found" | "sender_details_missing" | "invoice_rules_blocked";

/** Datum in gewone Nederlandse notatie: "2 december 2026". */
export function mailDate(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(date);
}

/** Betaalgegevens (IBAN, tenaamstelling) van de ondernemer als nette alinea. */
export function paymentTermsHtml(paymentTerms: string | null | undefined, invoiceNumber: string): string {
  const reference = `Vermeld bij het betalen het factuurnummer <strong>${escapeHtml(invoiceNumber)}</strong>.`;
  if (!paymentTerms?.trim()) return `<p style="margin:16px 0;color:#374151">${reference}</p>`;
  return `<p style="margin:16px 0;color:#374151"><strong>Betaalgegevens</strong><br>${escapeHtml(paymentTerms.trim()).replace(/\n/g, "<br>")}<br>${reference}</p>`;
}

/**
 * Mailt een factuur naar de klant, namens de ondernemer, met de bankgegevens
 * (en alleen met MOLLIE_INVOICE_PAYMENTS=1 ook een online betaalknop) en zet
 * DRAFT op SENT. Gedeeld door de verzendknop, aanbetalingen en periodieke facturen.
 * Ontbreken de verplichte afzendergegevens (bedrijfsnaam, adres, btw-nummer,
 * KvK-nummer; bij de KOR geen btw-nummer), dan gaat er niets weg en blijft de factuur een
 * concept: resultaat "sender_details_missing". Klopt de btw-soort of de KOR
 * niet meer met de huidige gegevens (bijv. het btw-nummer van de klant is
 * weg), dan ook niet: resultaat "invoice_rules_blocked".
 * Bij het uitreiken wordt een momentopname vastgelegd (lib/invoice-snapshot.ts).
 */
export async function sendInvoiceEmail(invoiceId: string, accountId: string): Promise<SendInvoiceResult> {
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId, userId: accountId },
    include: {
      customer: true,
      lineItems: { select: { vatRate: true } },
      user: { select: { ...partiesInclude.user.select, name: true } },
    },
  });
  if (!inv) return "not_found";
  if (!emailConfigured()) return "email_not_configured";
  if (!inv.customer.email) return "no_email";
  if (inv.status === "PAID" || inv.status === "CANCELED") return "already_closed";
  // Zonder bedrijfsnaam, adres, btw-nummer en KvK-nummer gaat er geen factuur weg.
  if (missingSenderFields(inv.user.company, inv.user.invoiceSettings?.korEnabled ?? false).length > 0) return "sender_details_missing";

  // Een concept wordt nu uitgereikt: leg de gegevens van dit moment vast. Een
  // al uitgereikte factuur gebruikt zijn eigen momentopname (of, bij een oude
  // factuur zonder momentopname, de huidige gegevens).
  // Heeft een concept al een momentopname (bijv. een eerdere poging), dan blijft die staan.
  let issueSnapshot: InvoiceSnapshot | null = null;
  if (inv.status === "DRAFT" && !parseInvoiceSnapshot(inv.snapshot)) {
    issueSnapshot = await issueSnapshotFor(db, accountId, inv, liveSource(inv));
    const problem = await issueProblemFor(db, accountId, issueSnapshot, {
      lineRates: inv.lineItems.map((li) => Number(li.vatRate)),
      isCredit: !!inv.originalInvoiceId || Number(inv.total) < 0,
      subtotal: Number(inv.subtotal),
      issueDate: inv.issueDate,
    });
    if (problem) return "invoice_rules_blocked";
  }
  const frozen = issueSnapshot ?? parseInvoiceSnapshot(inv.snapshot);
  const paymentTerms = frozen ? frozen.paymentTerms : inv.user.invoiceSettings?.paymentTerms ?? null;

  const company = senderName({ companyName: inv.user.company?.name, userName: inv.user.name, email: inv.user.email });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";
  const pdfUrl = invoicePdfLink(appUrl, inv.id, accountId);
  const total = Number(inv.total);
  const amount = formatMoney(total, "nl", inv.currency);

  // Online betalen alleen achter de vlag; mislukt het, dan blijven de bankgegevens.
  // Een gecrediteerde factuur krijgt geen betaallink: daar staat niets meer open.
  let payUrl: string | null = null;
  if (invoicePaymentsEnabled() && total > 0 && !inv.creditedAt) {
    try {
      payUrl = await createInvoicePayment({ id: inv.id, invoiceNumber: inv.invoiceNumber, total, currency: inv.currency });
    } catch {
      payUrl = null;
    }
  }

  const isCredit = total < 0;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">${label}</td><td style="padding:4px 0;color:#111827"><strong>${value}</strong></td></tr>`;
  const bodyHtml = `
      <p style="margin:0 0 12px">Beste ${escapeHtml(inv.customer.name)},</p>
      <p style="margin:0 0 12px">${isCredit
        ? `Hierbij ontvang je creditfactuur <strong>${escapeHtml(inv.invoiceNumber)}</strong> van ${escapeHtml(company)}.`
        : `Hierbij ontvang je factuur <strong>${escapeHtml(inv.invoiceNumber)}</strong> van ${escapeHtml(company)}.`}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:15px">
        ${row("Factuurnummer", escapeHtml(inv.invoiceNumber))}
        ${row("Bedrag", escapeHtml(amount))}
        ${inv.dueDate && !isCredit ? row("Te betalen vóór", escapeHtml(mailDate(inv.dueDate))) : ""}
      </table>
      ${klantButton("Factuur downloaden (pdf)", pdfUrl)}
      ${isCredit ? "" : paymentTermsHtml(paymentTerms, inv.invoiceNumber)}
      ${payUrl ? `<p style="margin:0;color:#374151">Liever meteen online betalen? Dat kan via <a href="${escapeHtml(payUrl)}" style="color:#111827">deze betaallink</a>.</p>` : ""}
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px">De downloadlink is 90 dagen geldig. Je hebt er geen account voor nodig. Vragen over deze factuur? Beantwoord deze e-mail, dan komt je bericht bij ${escapeHtml(company)}.</p>
      <p style="margin:20px 0 0">Met vriendelijke groet,<br>${escapeHtml(company)}</p>`;

  await sendEmail({
    required: true,
    to: inv.customer.email,
    replyTo: inv.user.email,
    fromName: `${company} via Saldova`,
    subject: `${isCredit ? "Creditfactuur" : "Factuur"} ${inv.invoiceNumber} van ${company}`,
    html: renderKlantEmail({
      companyName: company,
      companyLogo: inv.user.company?.logo,
      heading: `${isCredit ? "Creditfactuur" : "Factuur"} ${inv.invoiceNumber}`,
      preheader: isCredit ? `Creditfactuur van ${company}` : `Factuur van ${company} · ${amount}`,
      bodyHtml,
    }),
  });

  if (inv.status === "DRAFT") {
    const issue = {
      where: { id: inv.id, userId: accountId, status: "DRAFT" as const },
      data: { status: "SENT" as const, ...(issueSnapshot ? { snapshot: issueSnapshot as unknown as Prisma.InputJsonValue } : {}) },
    };
    if (isCreditNote(inv)) {
      // Een creditfactuur wordt uitgereikt: in dezelfde transactie staat het
      // origineel niet meer open (lib/invoice-credit.ts).
      await db.$transaction(async (tx) => {
        const flipped = await tx.invoice.updateMany(issue);
        if (flipped.count === 1) await markOriginalCredited(tx, accountId, inv);
      });
    } else {
      await db.invoice.updateMany(issue);
    }
  }
  return "sent";
}
