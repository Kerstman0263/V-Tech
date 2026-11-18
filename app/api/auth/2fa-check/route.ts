import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { loginEmailBlocked, recordLoginFailure, verifyPassword } from "@/lib/login-guard";

/**
 * POST /api/auth/2fa-check — { email, password } -> { needsTotp }.
 * Voor-controle bij het inloggen: kloppen de gegevens én staat 2FA aan, dan
 * vraagt het formulier de code. Foute gegevens geven altijd dezelfde 401,
 * zodat je niet kunt aflezen welke e-mails bestaan of 2FA hebben.
 *
 * Twee remmen: per IP-adres, en per e-mailadres over alle IP's samen
 * (dezelfde emmer als het echte inloggen, zie lib/login-guard). Een onbekend
 * adres krijgt een vergelijking tegen een vaste dummy-hash, zodat de
 * reactietijd gelijk blijft.
 */
export async function POST(req: Request) {
  const limited = rateLimitResponse(`login:${clientIp(req)}`, 20, 15 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password || email.length > 320 || password.length > 1024) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  if (loginEmailBlocked(email)) {
    return NextResponse.json(
      { error: "Te veel inlogpogingen voor dit e-mailadres. Probeer het over een kwartier opnieuw." },
      { status: 429 },
    );
  }

  const user = await db.user.findUnique({ where: { email }, select: { passwordHash: true, totpEnabled: true } });
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !valid) {
    recordLoginFailure(email);
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, needsTotp: user.totpEnabled });
}
