import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/auth-helpers";

// PATCH /api/admin/reviews/:id — goedkeuren of intrekken (approved true/false)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const approved = Boolean(body.approved);

    await db.review.update({ where: { id }, data: { approved } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/admin/reviews/:id — review definitief verwijderen
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await db.review.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
