import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { updateAssetSchema } from "@/lib/validations/asset";

// PATCH /api/assets/:id — bijwerken (ook afstoten via disposedAt)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateAssetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed" }, { status: 422 });
    }
    const d = parsed.data;
    const result = await db.asset.updateMany({
      where: { id, userId: user.accountId },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.purchaseDate !== undefined ? { purchaseDate: new Date(d.purchaseDate) } : {}),
        ...(d.purchasePrice !== undefined ? { purchasePrice: d.purchasePrice } : {}),
        ...(d.residualValue !== undefined ? { residualValue: d.residualValue } : {}),
        ...(d.usefulLifeMonths !== undefined ? { usefulLifeMonths: d.usefulLifeMonths } : {}),
        ...(d.disposedAt !== undefined ? { disposedAt: d.disposedAt ? new Date(d.disposedAt) : null } : {}),
        ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/assets/:id
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const result = await db.asset.deleteMany({ where: { id, userId: user.accountId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
