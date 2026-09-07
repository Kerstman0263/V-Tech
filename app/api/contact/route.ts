import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSchema } from "@/lib/validations/contact";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/contact — publiek contactformulier; slaat bericht op voor de admin.
export async function POST(req: Request) {
  const limited = rateLimitResponse(`contact:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (limited) return limited;

  const parsed = contactSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { name, email, subject, message } = parsed.data;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  await db.contactMessage.create({
    data: { name, email, subject: subject || null, message, ipAddress: ip },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
