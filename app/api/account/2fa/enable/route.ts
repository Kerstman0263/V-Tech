import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { rateLimit } from "@/lib/rate-limit";
import { generateBackupCodes, verifyTotp } from "@/lib/totp";
import { logPlatform } from "@/lib/audit";

/**
 * POST /api/account/2fa/enable — stap 2: { code } uit de authenticator-app.
 * Klopt de code, dan staat 2FA aan en krijgt de gebruiker éénmalig zijn
 * 10 back-upcodes (daarna alleen nog als hashes opgeslagen).
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    rateLimit(`2fa-enable:${user.id}`, 10, 15 * 60 * 1000);

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code : "";

    const current = await db.user.findUnique({ where: { id: user.id }, select: { email: true, totpSecret: true, totpEnabled: true } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.totpEnabled) return NextResponse.json({ error: "already_enabled" }, { status: 409 });
    const secret = decrypt(current.totpSecret);
    if (!secret) return NextResponse.json({ error: "setup_required" }, { status: 400 });

    if (!verifyTotp(secret, code)) {
      return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }

    const backup = generateBackupCodes();
    await db.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, totpEnabledAt: new Date(), totpBackupCodes: backup.hashes },
    });
    logPlatform({ id: user.id, email: current.email }, "security.2fa_enabled", "tweestapsverificatie ingeschakeld");

    return NextResponse.json({ ok: true, backupCodes: backup.plain });
  } catch (err) {
    return errorResponse(err);
  }
}
