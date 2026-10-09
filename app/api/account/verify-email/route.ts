import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { emailConfigured } from "@/lib/email";
import { sendVerificationEmail } from "@/lib/auth-emails";
import { HttpError } from "@/lib/http-error";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/account/verify-email — bevestigingsmail (opnieuw) versturen
export async function POST() {
  try {
    const sessionUser = await requireUser();
    rateLimit(`verify-resend:${sessionUser.id}`, 3, 60 * 60 * 1000);

    const user = await db.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, email: true, locale: true, emailVerifiedAt: true },
    });
    if (!user) throw new HttpError(404, "Not found");
    if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
    if (!emailConfigured()) throw new HttpError(503, "E-mail versturen is nog niet ingesteld.");

    await sendVerificationEmail(user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
