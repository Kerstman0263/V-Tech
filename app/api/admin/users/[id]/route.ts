import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, errorResponse, HttpError } from "@/lib/auth-helpers";
import { adminUpdateUserSchema } from "@/lib/validations/account";
import { logPlatform } from "@/lib/audit";
import { ensureAccountSubscription } from "@/lib/subscription";

// PATCH /api/admin/users/:id — plan / rol / status wijzigen
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const parsed = adminUpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const { plan, role, status, accountType } = parsed.data;

    const user = await db.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // De eigenaar is onaantastbaar via de API; en alleen de eigenaar mag
    // aan admin-accounts of aan rollen komen.
    if (user.role === "OWNER") {
      throw new HttpError(403, "Het eigenaar-account kan niet worden gewijzigd.");
    }
    if (user.role === "ADMIN" && actor.role !== "OWNER") {
      throw new HttpError(403, "Alleen de eigenaar kan admin-accounts wijzigen.");
    }
    if (role && actor.role !== "OWNER") {
      throw new HttpError(403, "Alleen de eigenaar kan rollen toekennen of intrekken.");
    }

    // Rol bijwerken op de user
    if (role) {
      await db.user.update({ where: { id }, data: { role } });
      logPlatform({ id: actor.id, email: actor.email }, "admin.role_changed", `${user.email} -> ${role}`);
    }

    // Paneel-wissel zzp <-> bedrijf: alleen voor account-eigenaren (niet voor teamleden).
    // Het abonnement volgt automatisch: bedrijf -> Business met 30 dagen proef, zzp -> Gratis.
    if (accountType) {
      if (user.ownerId) throw new HttpError(400, "Teamleden hebben geen eigen paneel; wijzig het account van de eigenaar.");
      await db.company.upsert({
        where: { userId: id },
        update: { accountType },
        create: { userId: id, accountType },
      });
      await ensureAccountSubscription(id, accountType);
      logPlatform({ id: actor.id, email: actor.email }, "account.type_changed", `${user.email} -> ${accountType}`);
    }

    // Plan/status bijwerken op de subscription (upsert voor zekerheid)
    if (plan || status) {
      logPlatform({ id: actor.id, email: actor.email }, "admin.plan_changed", `${user.email} -> ${plan ?? ""} ${status ?? ""}`.trim());
      await db.subscription.upsert({
        where: { userId: id },
        update: { ...(plan ? { plan } : {}), ...(status ? { status } : {}) },
        create: {
          userId: id,
          plan: plan ?? "FREE",
          status: status ?? "TRIALING",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/admin/users/:id — account + alle data verwijderen (AVG cascade)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    // Admin kan zichzelf niet verwijderen (voorkomt buitensluiting)
    if (admin.id === id) {
      return NextResponse.json(
        { error: "Je kunt je eigen admin-account niet verwijderen." },
        { status: 400 },
      );
    }

    // De eigenaar is onverwijderbaar; admins verwijderen alleen gewone
    // gebruikers — andere admins verwijderen kan alleen de eigenaar.
    const target = await db.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (target.role === "OWNER") {
      return NextResponse.json({ error: "Het eigenaar-account kan niet worden verwijderd." }, { status: 403 });
    }
    if (target.role === "ADMIN" && admin.role !== "OWNER") {
      return NextResponse.json({ error: "Alleen de eigenaar kan admin-accounts verwijderen." }, { status: 403 });
    }

    // Cascade delete is in het schema gedefinieerd (onDelete: Cascade),
    // dus één delete verwijdert alle gekoppelde persoonsgegevens (AVG).
    const deleted = await db.user.findUnique({ where: { id }, select: { email: true } });
    await db.user.delete({ where: { id } });
    logPlatform({ id: admin.id, email: admin.email }, "admin.user_deleted", deleted?.email ?? id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
