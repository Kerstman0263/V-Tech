import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { rateLimit } from "@/lib/rate-limit";
import { consumeBackupCode, verifyTotp } from "@/lib/totp";
import { logPlatform } from "@/lib/audit";

/**
 * POST /api/account/2fa/disable — { password, code }.
 * Uitzetten vereist wachtwoord ÉN een geldige code (of back-upcode): een
 * gestolen sessie kan de extra beveiliging dus niet zomaar uitschakelen.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    rateLimit(`2fa-disable:${user.id}`, 10, 15 * 60 * 1000);

    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code : "";

    const current = await db.user.findUnique({
      where: { id: user.id },
      select: { email: true, passwordHash: true, totpSecret: true, totpEnabled: true, totpBackupCodes: true },
    });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!current.totpEnabled) return NextResponse.json({ error: "not_enabled" }, { status: 409 });

    if (!password || !(await bcrypt.compare(password, current.passwordHash))) {
      return NextResponse.json({ error: "wrong_password" }, { status: 400 });
    }
    const secret = decrypt(current.totpSecret);
    const validTotp = !!secret && verifyTotp(secret, code);
    const validBackup = !validTotp && consumeBackupCode(code, current.totpBackupCodes) !== null;
    if (!validTotp && !validBackup) {
      return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpEnabledAt: null, totpSecret: null, totpBackupCodes: [] },
    });
    logPlatform({ id: user.id, email: current.email }, "security.2fa_disabled", "tweestapsverificatie uitgeschakeld");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
