import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { resetPasswordSchema } from "@/lib/validations/account";
import { logPlatform } from "@/lib/audit";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/auth/reset-password — { token, password }.
 * Wisselt de eenmalige link in en zet het nieuwe wachtwoord. Doordat de
 * wachtwoord-hash verandert, worden alle bestaande sessies ongeldig
 * (zie credentialFingerprint in lib/auth.ts). Wie de link uit de mail
 * gebruikt, bewijst ook dat het adres klopt: e-mail telt dan als bevestigd.
 */
export async function POST(req: Request) {
  const limited = rateLimitResponse(`reset:${clientIp(req)}`, 10, 15 * 60 * 1000);
  if (limited) return limited;

  const parsed = resetPasswordSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const tooShort = parsed.error.issues.some((i) => i.path[0] === "password");
    return NextResponse.json(
      { error: tooShort ? "Kies een wachtwoord van minimaal 8 tekens." : "Ongeldig verzoek." },
      { status: 422 },
    );
  }

  // Eerst hashen (traag), daarna pas de token inwisselen: zo blijft het
  // venster tussen inwisselen en opslaan zo klein mogelijk.
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const userId = await consumeAuthToken(parsed.data.token, "PASSWORD_RESET");
  if (!userId) {
    return NextResponse.json({ error: "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  if (!user) {
    return NextResponse.json({ error: "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan." }, { status: 400 });
  }
  const updated = await db.user.update({
    where: { id: userId },
    data: { passwordHash, ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }) },
    select: { id: true, email: true },
  });
  logPlatform({ id: updated.id, email: updated.email }, "auth.password_reset_completed", null);

  return NextResponse.json({ ok: true });
}
