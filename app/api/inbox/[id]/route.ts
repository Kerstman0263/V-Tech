import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";

// GET /api/inbox/:id — één inbox-item inclusief bestandsdata (data-URL) om te verwerken/bekijken.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const item = await db.inboxItem.findFirst({ where: { id, userId: user.accountId } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(item);
  } catch (err) {
    return errorResponse(err);
  }
}

const patchSchema = z.object({
  status: z.enum(["NEW", "PROCESSED", "DISMISSED"]),
  expenseId: z.string().optional(),
});

// PATCH /api/inbox/:id — verwerkt (gekoppeld aan uitgave) / genegeerd / terug naar nieuw.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige invoer" }, { status: 422 });
    const result = await db.inboxItem.updateMany({
      where: { id, userId: user.accountId },
      data: { status: parsed.data.status, expenseId: parsed.data.status === "PROCESSED" ? (parsed.data.expenseId ?? null) : null },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/inbox/:id — definitief verwijderen (ook het bestand).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const result = await db.inboxItem.deleteMany({ where: { id, userId: user.accountId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
