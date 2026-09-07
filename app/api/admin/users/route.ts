import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/auth-helpers";
import { adminCreateUserSchema } from "@/lib/validations/account";
import { sendAccountCreatedEmails } from "@/lib/account-emails";
import { logPlatform } from "@/lib/audit";

// GET /api/admin/users — overzicht van alle gebruikers + abonnement
export async function GET() {
  try {
    await requireAdmin();

    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        company: { select: { name: true } },
        role: true,
        ownerId: true,
        createdAt: true,
        subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
        _count: { select: { invoices: true, customers: true } },
      },
    });

    return NextResponse.json(users);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/admin/users — handmatig een account aanmaken
export async function POST(req: Request) {
  try {
    const actor0 = await requireAdmin();
    const body = await req.json();
    const parsed = adminCreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const { email, password, companyName, role, plan } = parsed.data;

    // Alleen de eigenaar mag nieuwe admins benoemen
    if (role === "ADMIN") {
      const actor = await requireAdmin();
      if (actor.role !== "OWNER") {
        return NextResponse.json({ error: "Alleen de eigenaar kan admins toevoegen." }, { status: 403 });
      }
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "E-mail al in gebruik" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        role,
        company: { create: { name: companyName || null } },
        subscription: {
          create: { plan, status: plan === "FREE" ? "TRIALING" : "ACTIVE" },
        },
      },
      select: { id: true, email: true, role: true },
    });

    logPlatform({ id: actor0.id, email: actor0.email }, "admin.user_created", `${email} (rol ${role}, plan ${plan})`);

    await sendAccountCreatedEmails({ email, companyName, source: "beheer" });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
