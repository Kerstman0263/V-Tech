import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { changePasswordSchema } from "@/lib/validations/account";

// POST /api/account/password — wachtwoord wijzigen (vereist huidig wachtwoord)
export async function POST(req: Request) {
  try {
    const sessionUser = await requireUser();
    const parsed = changePasswordSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Huidig wachtwoord klopt niet" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.user.update({ where: { id: user.id }, data: { passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
