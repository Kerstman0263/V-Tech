import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * GET /api/auth/verify-email?token=... — link uit de bevestigingsmail.
 * Een GET mag hier iets wijzigen: het enige effect is "adres bevestigd",
 * en ook een virusscanner die de link vooraf opent bewijst dat de mail
 * in die inbox is aangekomen. Daarna door naar het dashboard (of login).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? url.origin).replace(/\/$/, "");

  const limited = rateLimitResponse(`verify:${clientIp(req)}`, 30, 15 * 60 * 1000);
  if (limited) return NextResponse.redirect(`${base}/login?verify=invalid`, 303);

  const userId = await consumeAuthToken(url.searchParams.get("token") ?? "", "EMAIL_VERIFY");
  if (!userId) return NextResponse.redirect(`${base}/login?verify=invalid`, 303);

  const user = await db.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
    select: { locale: true },
  }).catch(() => null);
  if (!user) return NextResponse.redirect(`${base}/login?verify=invalid`, 303);

  return NextResponse.redirect(`${base}${user.locale === "en" ? "/en" : ""}/dashboard?verified=1`, 303);
}
