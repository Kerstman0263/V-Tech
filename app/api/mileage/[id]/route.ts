import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertOwnedRefs } from "@/lib/ownership";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { can } from "@/lib/permissions";
import { updateMileageSchema } from "@/lib/validations/mileage";

// Een medewerker mag alleen zijn eigen ritten raken; eigenaar/manager alles.
function ownScope(user: { id: string; accountId: string; role?: string | null; teamRole?: string | null }) {
  return can(user, "manageTeam") ? {} : { createdById: user.id };
}

// PATCH /api/mileage/:id — rit bewerken
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = updateMileageSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const d = parsed.data;

    // Controleer eigenaarschap + werk bij
    await assertOwnedRefs(user.accountId, { projectId: d.projectId });

    const result = await db.mileageEntry.updateMany({
      where: { id, userId: user.accountId, ...ownScope(user) },
      data: {
        ...(d.projectId !== undefined ? { projectId: d.projectId || null } : {}),
        ...(d.date !== undefined ? { date: d.date } : {}),
        ...(d.fromAddress !== undefined ? { fromAddress: d.fromAddress } : {}),
        ...(d.toAddress !== undefined ? { toAddress: d.toAddress } : {}),
        ...(d.distanceKm !== undefined ? { distanceKm: d.distanceKm } : {}),
        ...(d.type !== undefined ? { type: d.type } : {}),
        ...(d.ratePerKm !== undefined ? { ratePerKm: d.ratePerKm } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
      },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/mileage/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await db.mileageEntry.deleteMany({ where: { id, userId: user.accountId, ...ownScope(user) } });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
