import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSchema } from "@/lib/validations/contact";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { parseContactTopic, subjectForTopic } from "@/lib/contact-topics";

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
  const { name, email, subject, message, topic } = parsed.data;
  // Bekend onderwerp (bv. startgesprek): de onderwerpregel begint dan altijd
  // met de vaste titel, zodat de eigenaar het in de berichten herkent.
  const storedSubject = subjectForTopic(parseContactTopic(topic), subject);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  await db.contactMessage.create({
    data: { name, email, subject: storedSubject, message, ipAddress: ip },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
