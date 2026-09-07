import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { encrypt } from "@/lib/encryption";
import { generateTotpSecret, totpProvisioning, totpQrDataUrl } from "@/lib/totp";

/**
 * POST /api/account/2fa/setup — stap 1 van inschakelen.
 * Maakt een nieuw geheim, bewaart het versleuteld (nog NIET actief) en geeft
 * de QR-code + handmatige sleutel terug. Pas na een geldige code in
 * /enable staat 2FA echt aan.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const current = await db.user.findUnique({ where: { id: user.id }, select: { email: true, totpEnabled: true } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.totpEnabled) {
      return NextResponse.json({ error: "already_enabled" }, { status: 409 });
    }

    const secret = generateTotpSecret();
    await db.user.update({ where: { id: user.id }, data: { totpSecret: encrypt(secret) } });

    const { uri, manualKey } = totpProvisioning(secret, current.email);
    const qr = await totpQrDataUrl(uri);
    return NextResponse.json({ qr, manualKey });
  } catch (err) {
    return errorResponse(err);
  }
}
