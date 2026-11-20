import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSchema } from "@/lib/validations/contact";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/contact — publiek contactformulier; slaat bericht op voor de admin.
export async function POST(req: Request) {
  const limited = rateLimitResponse(`contact:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (limited) return limited;

  // Lege of kapotte body (geen geldige JSON): een nette 400, geen serverfout.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We konden je bericht niet lezen. Vul het formulier opnieuw in en probeer het nog eens." },
      { status: 400 },
    );
  }

  const parsed = contactSchema.safeParse(body);
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

  try {
    await db.contactMessage.create({
      data: { name, email, subject: subject || null, message, ipAddress: ip },
    });
  } catch {
    console.error("[api] contact_failed");
    return NextResponse.json(
      { error: "Je bericht is niet verstuurd. Probeer het later opnieuw." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
