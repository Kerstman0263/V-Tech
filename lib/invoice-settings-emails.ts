import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { emailButton, escapeHtml, renderEmail } from "@/lib/email-templates";
import { paymentTermsChangeLabel } from "@/lib/invoice-settings-change";

/**
 * Melding aan de eigenaar dat de betaalgegevens op facturen (IBAN,
 * tenaamstelling) zijn gewijzigd. Die staan op elke factuur, herinnering,
 * QR-code en e-factuur. Een onverwachte wijziging valt zo meteen op.
 * Het IBAN staat er alleen deels afgeschermd in.
 */
export async function sendPaymentDetailsChangedEmail(input: {
  accountId: string;
  actorName: string;
  before: string | null | undefined;
  after: string | null | undefined;
}): Promise<void> {
  const owner = await db.user.findUnique({ where: { id: input.accountId }, select: { email: true } });
  if (!owner?.email) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";
  const when = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date());
  await sendEmail({
    to: owner.email,
    subject: "Je betaalgegevens op facturen zijn gewijzigd",
    html: renderEmail({
      heading: "Betaalgegevens gewijzigd",
      preheader: "Het rekeningnummer of de tenaamstelling op je facturen is aangepast.",
      bodyHtml: `
        <p style="margin:0 0 12px">De betaalgegevens die op je facturen staan, zijn zojuist gewijzigd.</p>
        <p style="margin:0 0 4px"><strong>Wat:</strong> ${escapeHtml(paymentTermsChangeLabel(input.before, input.after))}</p>
        <p style="margin:0 0 4px"><strong>Door:</strong> ${escapeHtml(input.actorName)}</p>
        <p style="margin:0 0 12px"><strong>Wanneer:</strong> ${escapeHtml(when)}</p>
        <p style="margin:0">Was jij dit niet? Wijzig dan meteen je wachtwoord en zet je betaalgegevens terug. Facturen die je vanaf nu verstuurt, krijgen deze betaalgegevens.</p>
        ${emailButton("Factuurinstellingen bekijken", `${appUrl}/invoices/settings`)}
      `,
    }),
  });
}
