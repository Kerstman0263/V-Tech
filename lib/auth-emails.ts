import { sendEmail } from "@/lib/email";
import { renderEmail, emailButton } from "@/lib/email-templates";
import { createAuthToken } from "@/lib/auth-tokens";

/**
 * E-mails met eenmalige links: wachtwoord-reset en e-mailverificatie.
 * Taal volgt de voorkeur van de gebruiker (nl/en). Verzendfouten worden
 * gelogd maar lekken niet naar de aanvrager (geen account-enumeratie).
 */

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app").replace(/\/$/, "");
}

function localePrefix(locale: string | null | undefined): string {
  return locale === "en" ? "/en" : "";
}

export function verifyUrl(token: string): string {
  return `${appUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

export function resetUrl(token: string, locale?: string | null): string {
  return `${appUrl()}${localePrefix(locale)}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(user: { id: string; email: string; locale?: string | null }): Promise<void> {
  const token = await createAuthToken(user.id, "PASSWORD_RESET");
  const en = user.locale === "en";
  await sendEmail({
    to: user.email,
    subject: en ? "Reset your Saldova password" : "Je Saldova-wachtwoord opnieuw instellen",
    idempotencyKey: `saldova-reset-${token.slice(0, 16)}`,
    html: renderEmail({
      heading: en ? "Reset your password" : "Nieuw wachtwoord instellen",
      preheader: en ? "This link is valid for 1 hour." : "Deze link is 1 uur geldig.",
      bodyHtml: en
        ? `<p style="margin:0 0 12px">We received a request to reset the password for this Saldova account.</p>
           ${emailButton("Choose a new password", resetUrl(token, user.locale))}
           <p style="margin:0;color:#9ca3af;font-size:13px">The link is valid for 1 hour and works once. Didn't request this? You can ignore this email — your password stays the same.</p>`
        : `<p style="margin:0 0 12px">We kregen een verzoek om het wachtwoord van dit Saldova-account opnieuw in te stellen.</p>
           ${emailButton("Kies een nieuw wachtwoord", resetUrl(token, user.locale))}
           <p style="margin:0;color:#9ca3af;font-size:13px">De link is 1 uur geldig en werkt één keer. Heb je dit niet aangevraagd? Dan kun je deze mail negeren — je wachtwoord blijft hetzelfde.</p>`,
    }),
  });
}

export async function sendVerificationEmail(user: { id: string; email: string; locale?: string | null }): Promise<void> {
  const token = await createAuthToken(user.id, "EMAIL_VERIFY");
  const en = user.locale === "en";
  await sendEmail({
    to: user.email,
    subject: en ? "Confirm your email address" : "Bevestig je e-mailadres",
    idempotencyKey: `saldova-verify-${token.slice(0, 16)}`,
    html: renderEmail({
      heading: en ? "Confirm your email address" : "Bevestig je e-mailadres",
      preheader: en ? "One click and your account is confirmed." : "Eén klik en je account is bevestigd.",
      bodyHtml: en
        ? `<p style="margin:0 0 12px">Confirm that this address belongs to you, so invoices, reminders and password resets reach you.</p>
           ${emailButton("Confirm email address", verifyUrl(token))}
           <p style="margin:0;color:#9ca3af;font-size:13px">The link is valid for 7 days. Didn't create a Saldova account? Then you can ignore this email.</p>`
        : `<p style="margin:0 0 12px">Bevestig dat dit adres van jou is, zodat facturen, herinneringen en wachtwoord-resets je bereiken.</p>
           ${emailButton("E-mailadres bevestigen", verifyUrl(token))}
           <p style="margin:0;color:#9ca3af;font-size:13px">De link is 7 dagen geldig. Heb je geen Saldova-account aangemaakt? Dan kun je deze mail negeren.</p>`,
    }),
  });
}
