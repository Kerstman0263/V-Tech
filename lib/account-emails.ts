import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { renderEmail, emailButton, escapeHtml } from "@/lib/email-templates";

/**
 * E-mails rond accountaanmaak:
 *  1. Welkomstmail naar de nieuwe gebruiker.
 *  2. Notificatie naar de platform-eigenaar (SUPPORT_NOTIFY_EMAIL,
 *     anders de eerste OWNER/ADMIN).
 * Fire-and-forget: e-mail mag registratie nooit laten falen.
 */
export async function sendAccountCreatedEmails({
  email,
  companyName,
  source,
}: {
  email: string;
  companyName?: string | null;
  source: "registratie" | "beheer" | "team";
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";

  // 1. Welkomstmail naar de nieuwe gebruiker
  const welcome = sendEmail({
    to: email,
    subject: "Welkom bij Saldova",
    html: renderEmail({
      heading: "Welkom bij Saldova!",
      preheader: "Je account is klaar — log in en zet je administratie op de rails.",
      bodyHtml: `
        <p style="margin:0 0 12px">Je account${companyName ? ` voor <strong>${escapeHtml(companyName)}</strong>` : ""} is aangemaakt.</p>
        <p style="margin:0">Log in en zet je administratie in een paar minuten op de rails: facturen, offertes, uren en meer.</p>
        ${emailButton("Inloggen bij Saldova", `${appUrl}/login`)}
        <p style="margin:0;color:#9ca3af;font-size:13px">Kreeg je dit bericht onverwacht? Dan heeft iemand dit adres per ongeluk gebruikt — je kunt deze mail negeren.</p>
      `,
    }),
  });

  // 2. Notificatie naar de eigenaar
  const notifyOwner = (async () => {
    let to = process.env.SUPPORT_NOTIFY_EMAIL ?? null;
    if (!to) {
      const boss = await db.user.findFirst({
        where: { role: { in: ["OWNER", "ADMIN"] } },
        orderBy: [{ role: "desc" }, { createdAt: "asc" }], // OWNER vóór ADMIN
        select: { email: true },
      });
      to = boss?.email ?? null;
    }
    // Niet jezelf mailen over je eigen nieuwe account
    if (!to || to === email) return;
    await sendEmail({
      to,
      subject: `Nieuw Saldova-account: ${email}`,
      html: renderEmail({
        heading: "Nieuw account aangemaakt",
        bodyHtml: `
          <p style="margin:0 0 4px"><strong>E-mail:</strong> ${escapeHtml(email)}</p>
          ${companyName ? `<p style="margin:0 0 4px"><strong>Bedrijf:</strong> ${escapeHtml(companyName)}</p>` : ""}
          <p style="margin:0"><strong>Via:</strong> ${escapeHtml(source)}</p>
          ${emailButton("Bekijk in Beheer", `${appUrl}/admin`)}
        `,
      }),
    });
  })();

  await Promise.allSettled([welcome, notifyOwner]);
}
