import { createHash } from "node:crypto";
import { HttpError } from "@/lib/http-error";

/**
 * Lichtgewicht e-mailhelper via de Resend REST API (geen extra dependency).
 * Werkt alleen als RESEND_API_KEY is gezet; anders no-op met een log,
 * zodat de app lokaal werkt zonder e-mailprovider.
 *
 * Zet in .env:
 *   RESEND_API_KEY=re_...
 *   EMAIL_FROM="Saldova <noreply@jouwdomein.nl>"
 */
/** True zodra er een RESEND_API_KEY is ingesteld (e-mail werkt echt). */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Financial actions must fail visibly when delivery is not accepted. */
  required?: boolean;
  idempotencyKey?: string;
  /** Antwoordadres: replies van de klant gaan naar de gebruiker zelf. */
  replyTo?: string;
  /** Weergavenaam van de afzender, bijv. "Scootershop Jansen via Saldova".
   *  Het verzendadres blijft altijd het centrale EMAIL_FROM-adres. */
  fromName?: string;
}

/**
 * Sandbox-vangnet. Met het gratis onboarding@resend.dev-domein mag Resend
 * alleen mailen naar het adres waarmee het Resend-account is aangemaakt.
 * Testen we lokaal met mock-medewerkers (fictieve adressen), dan zou elke mail
 * met een 403 falen. Daarom in development ALTIJD de ontvanger omleiden naar
 * ons eigen testadres, en het echte adres in het onderwerp tonen.
 *
 * Zet EMAIL_TEST_REDIRECT in .env.local op je Resend-accountadres.
 * In productie (NODE_ENV=production) gebeurt er niets — mails gaan normaal.
 */
function applySandbox(to: string, subject: string): { to: string; subject: string } {
  if (process.env.NODE_ENV !== "development") return { to, subject };

  const redirect =
    process.env.EMAIL_TEST_REDIRECT ?? process.env.SUPPORT_NOTIFY_EMAIL ?? process.env.ADMIN_EMAIL ?? null;

  if (!redirect || redirect === to) return { to, subject };

  return { to: redirect, subject: `[DEV → ${to}] ${subject}` };
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { html, replyTo, fromName } = input;
  const key = process.env.RESEND_API_KEY;
  const configured = process.env.EMAIL_FROM ?? "Saldova <onboarding@resend.dev>";
  // Adresdeel uit EMAIL_FROM halen zodat fromName alleen de naam vervangt
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured;
  const from = fromName ? `${fromName.replace(/[<>"]/g, "")} <${address}>` : configured;

  // Ontvanger + onderwerp eventueel omleiden (alleen in development).
  const { to, subject } = applySandbox(input.to, input.subject);

  if (!key) {
    if (input.required) throw new HttpError(503, "E-mail versturen is nog niet ingesteld. Je kunt de PDF wel downloaden.");
    return;
  }

  try {
    const text = input.text ?? html
      .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
      .replace(/<\/(p|div|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();
    const payload = { from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) };
    const dedupe = input.idempotencyKey ?? (input.required
      ? `saldova-email-${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}` : undefined);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(dedupe ? { "Idempotency-Key": dedupe } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[email] provider_rejected", { status: res.status });
      if (input.required) throw new HttpError(503, "De e-mail kon niet worden verstuurd. Er is geen verzonden-status opgeslagen. Probeer het opnieuw.");
    }
  } catch (err) {
    // E-mail mag nooit de hoofdactie laten falen
    console.error("[email] delivery_failed", { type: err instanceof Error ? err.name : "UnknownError" });
    if (input.required) throw err instanceof HttpError ? err : new HttpError(503, "De e-maildienst reageert niet. Probeer het opnieuw.");
  }
}
