import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviewSchema } from "@/lib/validations/review";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/reviews — publiek; slaat een review op die WACHT op goedkeuring.
// Verschijnt pas op de site nadat een admin 'm goedkeurt (approved = true).
export async function POST(req: Request) {
  const limited = rateLimitResponse(`review:${clientIp(req)}`, 3, 60 * 60 * 1000);
  if (limited) return limited;

  const parsed = reviewSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { name, role, rating, email } = parsed.data;
  // Links horen niet in een review: voorkomt dat de site-reviews als spam-/phishingkanaal dienen.
  const body = parsed.data.body.replace(/https?:\/\/\S+/gi, "").replace(/\s{2,}/g, " ").trim();

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  await db.review.create({
    data: {
      name,
      role: role || null,
      rating,
      body,
      email: email || null,
      approved: false,
      ipAddress: ip,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
