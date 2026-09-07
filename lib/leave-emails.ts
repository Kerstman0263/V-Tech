import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { renderEmail, emailButton, emailBadge, escapeHtml } from "@/lib/email-templates";
import type { LeaveType } from "@prisma/client";

/**
 * E-mails rond verlofaanvragen (alleen BEDRIJF-accounts).
 *  1. Medewerker dient in -> mail naar eigenaar + leidinggevenden.
 *  2. Beslissing genomen  -> statusmail naar de medewerker.
 * Alles fire-and-forget: e-mail mag de aanvraag/beslissing nooit laten falen.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";

const TYPE_NL: Record<LeaveType, string> = {
  VACATION: "Vakantie",
  SICK: "Ziekmelding",
  SPECIAL: "Bijzonder verlof",
};

/** Datumbereik netjes formatteren (12 jul 2026 t/m 16 jul 2026). */
function period(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  const s = fmt.format(start);
  const e = fmt.format(end);
  return s === e ? s : `${s} t/m ${e}`;
}

/** Kleine feiten-tabel voor in de mail. */
function factsTable(rows: [string, string][]): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 4px;border-collapse:collapse">
      ${rows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;width:130px;vertical-align:top">${escapeHtml(label)}</td>
          <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:500">${value}</td>
        </tr>`,
        )
        .join("")}
    </table>`;
}

/**
 * 1. Nieuwe aanvraag -> naar de eigenaar en alle leidinggevenden (MANAGER).
 * De aanvrager zelf wordt nooit gemaild (die weet het al).
 */
export async function sendLeaveRequestedEmail({
  accountId,
  requesterId,
  requesterName,
  type,
  startDate,
  endDate,
  hours,
  note,
}: {
  accountId: string;
  requesterId: string;
  requesterName: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  hours: number;
  note?: string | null;
}): Promise<void> {
  // Eigenaar (accountId) + leidinggevenden binnen dit account.
  const recipients = await db.user.findMany({
    where: {
      OR: [{ id: accountId }, { ownerId: accountId, teamRole: "MANAGER" }],
      NOT: { id: requesterId }, // niet naar de aanvrager zelf
    },
    select: { email: true },
  });
  if (recipients.length === 0) return;

  const html = renderEmail({
    heading: "Nieuwe verlofaanvraag",
    preheader: `${requesterName} vraagt ${TYPE_NL[type].toLowerCase()} aan (${period(startDate, endDate)}).`,
    bodyHtml: `
      <p style="margin:0 0 8px"><strong>${escapeHtml(requesterName)}</strong> heeft een verlofaanvraag ingediend.</p>
      ${factsTable([
        ["Type", escapeHtml(TYPE_NL[type])],
        ["Periode", escapeHtml(period(startDate, endDate))],
        ["Aantal uren", `${hours} uur`],
        ...(note ? ([["Toelichting", escapeHtml(note)]] as [string, string][]) : []),
      ])}
      ${emailButton("Beoordeel aanvraag", `${APP_URL}/verlof`)}
      <p style="margin:0;color:#9ca3af;font-size:13px">Je kunt de aanvraag goedkeuren of afwijzen in het verlofoverzicht.</p>
    `,
  });

  // Elk als losse, faalveilige mail (één slecht adres blokkeert de rest niet).
  await Promise.allSettled(
    recipients.map((r) =>
      sendEmail({
        to: r.email,
        subject: `Verlofaanvraag van ${requesterName}`,
        html,
      }),
    ),
  );
}

/**
 * 2. Beslissing (goedgekeurd/afgewezen) -> naar de aanvrager.
 * Wordt niet aangeroepen bij annuleren of bij eigen verlof van de baas.
 */
export async function sendLeaveDecisionEmail({
  to,
  requesterName,
  approved,
  type,
  startDate,
  endDate,
  hours,
  decidedByName,
}: {
  to: string;
  requesterName: string;
  approved: boolean;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  hours: number;
  decidedByName?: string | null;
}): Promise<void> {
  const badge = approved ? emailBadge("Goedgekeurd", "green") : emailBadge("Afgewezen", "red");
  const lead = approved
    ? "Goed nieuws — je verlofaanvraag is goedgekeurd."
    : "Je verlofaanvraag is helaas afgewezen.";

  const html = renderEmail({
    heading: "Update over je verlofaanvraag",
    preheader: lead,
    bodyHtml: `
      <p style="margin:0 0 12px">Beste ${escapeHtml(requesterName)}, ${escapeHtml(lead)}</p>
      <p style="margin:0 0 12px">${badge}</p>
      ${factsTable([
        ["Type", escapeHtml(TYPE_NL[type])],
        ["Periode", escapeHtml(period(startDate, endDate))],
        ["Aantal uren", `${hours} uur`],
        ...(decidedByName ? ([["Beoordeeld door", escapeHtml(decidedByName)]] as [string, string][]) : []),
      ])}
      ${emailButton("Bekijk in Saldova", `${APP_URL}/verlof`)}
      ${
        approved
          ? ""
          : `<p style="margin:0;color:#9ca3af;font-size:13px">Vragen over deze beslissing? Neem contact op met je leidinggevende.</p>`
      }
    `,
  });

  await sendEmail({
    to,
    subject: approved ? "Je verlof is goedgekeurd" : "Je verlofaanvraag is afgewezen",
    html,
  });
}
