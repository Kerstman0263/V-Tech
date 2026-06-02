import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Minimaal 8 tekens"),
  companyName: z.string().optional(),
});

// POST /api/register — nieuw account aanmaken
export async function POST(req: Request) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { email, password, companyName } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "E-mail al in gebruik" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      companyName: companyName || null,
      // Trial-abonnement direct aanmaken
      subscription: { create: { status: "TRIALING" } },
    },
  });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
