import { sendEmail } from "@/lib/email";
import { emailBadge, emailButton, escapeHtml, renderEmail } from "@/lib/email-templates";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";

/**
 * Beslissing over uren -> mail naar de medewerker. Eén mail per beslissing
 * (ook bij "alles goedkeuren": dan één samenvattende mail per medewerker).
 * Fire-and-forget door de aanroeper; e-mail mag de beslissing nooit laten falen.
 */
export async function sendTimeDecisionEmail({
  to,
  memberName,
  locale,
  approved,
  totalHours,
  count,
  decidedByName,
  reason,
}: {
  to: string;
  memberName: string;
  locale: string;
  approved: boolean;
  totalHours: number;
  count: number;
  decidedByName: string | null;
  reason?: string | null;
}): Promise<void> {
  const en = locale === "en";
  const hours = totalHours.toLocaleString(en ? "en-US" : "nl-NL", { maximumFractionDigits: 2 });
  const by = decidedByName ? escapeHtml(decidedByName) : en ? "your manager" : "je leidinggevende";
  const plural = count > 1;

  const subject = approved
    ? en
      ? `${hours} hours approved`
      : `${hours} uur goedgekeurd`
    : en
      ? `${hours} hours rejected — please review`
      : `${hours} uur afgekeurd — kijk er nog eens naar`;

  const heading = approved ? (en ? "Hours approved" : "Uren goedgekeurd") : en ? "Hours rejected" : "Uren afgekeurd";

  const intro = approved
    ? en
      ? `<p>Hi ${escapeHtml(memberName)}, ${by} approved ${plural ? `${count} time entries` : "your time entry"} (${hours} hours in total). They can now be invoiced.</p>`
      : `<p>Hoi ${escapeHtml(memberName)}, ${by} heeft ${plural ? `${count} urenregistraties` : "je urenregistratie"} goedgekeurd (${hours} uur in totaal). Ze kunnen nu gefactureerd worden.</p>`
    : en
      ? `<p>Hi ${escapeHtml(memberName)}, ${by} rejected ${plural ? `${count} time entries` : "your time entry"} (${hours} hours). Adjust the entry and it will be reviewed again.</p>`
      : `<p>Hoi ${escapeHtml(memberName)}, ${by} heeft ${plural ? `${count} urenregistraties` : "je urenregistratie"} afgekeurd (${hours} uur). Pas de registratie aan; daarna wordt hij opnieuw beoordeeld.</p>`;

  const reasonHtml = !approved && reason ? `<p style="margin:8px 0 0;padding:10px 12px;border-left:3px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:14px">${en ? "Reason" : "Reden"}: ${escapeHtml(reason)}</p>` : "";

  const html = renderEmail({
    heading,
    preheader: subject,
    bodyHtml: `${emailBadge(approved ? (en ? "Approved" : "Goedgekeurd") : en ? "Rejected" : "Afgekeurd", approved ? "green" : "red")}${intro}${reasonHtml}${emailButton(en ? "Open my hours" : "Open mijn uren", `${APP_URL}/${locale}/time`)}`,
  });

  await sendEmail({ to, subject, html });
}
