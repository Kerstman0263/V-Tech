import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/auth/2fa-check — { email, password } -> { needsTotp }.
 * Voor-controle bij het inloggen: kloppen de gegevens én staat 2FA aan, dan
 * vraagt het formulier de code. Foute gegevens geven altijd dezelfde 401,
 * zodat je niet kunt aflezen welke e-mails bestaan of 2FA hebben.
 */
export async function POST(req: Request) {
  const limited = rateLimitResponse(`login:${clientIp(req)}`, 20, 15 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "invalid" }, { status: 401 });

  const user = await db.user.findUnique({ where: { email }, select: { passwordHash: true, totpEnabled: true } });
  const valid = !!user && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) return NextResponse.json({ error: "invalid" }, { status: 401 });

  return NextResponse.json({ ok: true, needsTotp: user!.totpEnabled });
}
