import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { updateProjectSchema } from "@/lib/validations/project";

// PATCH /api/projects/:id — project bewerken / archiveren
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const d = parsed.data;

    // Klant moet van deze gebruiker zijn (geen IDOR)
    if (d.customerId) {
      const c = await db.customer.findFirst({ where: { id: d.customerId, userId: user.accountId } });
      if (!c) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const result = await db.project.updateMany({
      where: { id, userId: user.accountId },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.customerId !== undefined ? { customerId: d.customerId || null } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.hourlyRate !== undefined ? { hourlyRate: d.hourlyRate } : {}),
        ...(d.archived !== undefined ? { archived: d.archived } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/projects/:id — project verwijderen (uren/ritten blijven, link wordt null)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const result = await db.project.deleteMany({ where: { id, userId: user.accountId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
