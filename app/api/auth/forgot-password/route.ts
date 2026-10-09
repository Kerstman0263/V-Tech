import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { sendPasswordResetEmail } from "@/lib/auth-emails";
import { forgotPasswordSchema } from "@/lib/validations/account";
import { logPlatform } from "@/lib/audit";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/auth/forgot-password — { email } -> altijd { ok: true }.
 * Het antwoord is gelijk voor bestaande en onbekende adressen, zodat je niet
 * kunt aflezen wie een account heeft. `emailConfigured` zegt alleen iets over
 * de server (geen e-mailprovider = er komt nooit een mail), niet over het adres.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limitedIp = rateLimitResponse(`forgot:${ip}`, 10, 60 * 60 * 1000);
  if (limitedIp) return limitedIp;

  const parsed = forgotPasswordSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 422 });
  }
  const { email } = parsed.data;

  // Per adres maximaal 3 mails per uur (beschermt de inbox van het slachtoffer).
  const limitedEmail = rateLimitResponse(`forgot-email:${email}`, 3, 60 * 60 * 1000);
  if (limitedEmail) return limitedEmail;

  const configured = emailConfigured();
  if (configured) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, locale: true } });
    if (user) {
      try {
        await sendPasswordResetEmail(user);
        logPlatform({ id: user.id, email: user.email }, "auth.password_reset_requested", null);
      } catch (err) {
        console.error("[forgot-password] send_failed", { type: err instanceof Error ? err.name : "UnknownError" });
      }
    }
  }

  return NextResponse.json({ ok: true, emailConfigured: configured });
}
