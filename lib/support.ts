import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
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
    html: `
      <h2>Nieuw support-bericht</h2>
      <p><strong>${escapeHtml(fromName)}</strong> stuurde:</p>
      <blockquote style="border-left:3px solid #4f46e5;padding-left:12px;color:#374151">${escapeHtml(body)}</blockquote>
      <p><a href="${appUrl()}/admin/support">Open de support-inbox →</a></p>
    `,
  });
}

/** Notificeert de klant per e-mail bij een antwoord van support. */
export async function notifyUserReply(userEmail: string, body: string) {
  await sendEmail({
    to: userEmail,
    subject: "Antwoord van Saldova support",
    html: `
      <h2>Je hebt een antwoord van support</h2>
      <blockquote style="border-left:3px solid #4f46e5;padding-left:12px;color:#374151">${escapeHtml(body)}</blockquote>
      <p><a href="${appUrl()}/dashboard">Open de chat in je dashboard →</a></p>
    `,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
