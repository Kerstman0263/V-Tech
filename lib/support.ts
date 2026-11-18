import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { emailButton, escapeHtml, renderEmail } from "@/lib/email-templates";
import type { SupportStatus } from "@prisma/client";

/** Haalt de thread van een gebruiker op of maakt 'm aan, en zet optioneel de status. */
export async function setThreadStatus(userId: string, status: SupportStatus) {
  return db.supportThread.upsert({
    where: { userId },
    update: { status },
    create: { userId, status },
  });
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Het bericht zelf als rustig citaat; regelafbrekingen blijven staan. */
function quote(body: string): string {
  return `<blockquote style="margin:0 0 8px;border-left:3px solid #a78bfa;padding:4px 0 4px 12px;color:#374151;white-space:pre-line">${escapeHtml(body)}</blockquote>`;
}

/** Notificeert de admin per e-mail bij een nieuw bericht van een klant. */
export async function notifyAdminNewMessage(fromName: string, body: string) {
  // Bepaal ontvanger: expliciet ingesteld adres, anders de eerste admin.
  let to = process.env.SUPPORT_NOTIFY_EMAIL ?? null;
  if (!to) {
    const admin = await db.user.findFirst({
      where: { role: { in: ["ADMIN", "OWNER"] } },
      select: { email: true },
      orderBy: { createdAt: "asc" },
    });
    to = admin?.email ?? null;
  }
  if (!to) return;

  await sendEmail({
    to,
    subject: `Nieuw support-bericht van ${fromName}`,
    html: renderEmail({
      heading: "Nieuw support-bericht",
      preheader: `${fromName} stuurde een bericht via de support-chat.`,
      bodyHtml: `
        <p style="margin:0 0 12px"><strong>${escapeHtml(fromName)}</strong> stuurde:</p>
        ${quote(body)}
        ${emailButton("Open de support-inbox", `${appUrl()}/admin/support`)}
      `,
    }),
  });
}

/** Notificeert de klant per e-mail bij een antwoord van support. */
export async function notifyUserReply(userEmail: string, body: string) {
  await sendEmail({
    to: userEmail,
    subject: "Antwoord van Saldova support",
    html: renderEmail({
      heading: "Je hebt een antwoord van support",
      preheader: "Er staat een antwoord voor je klaar in de support-chat.",
      bodyHtml: `
        ${quote(body)}
        ${emailButton("Open de chat in je dashboard", `${appUrl()}/dashboard`)}
      `,
    }),
  });
}
