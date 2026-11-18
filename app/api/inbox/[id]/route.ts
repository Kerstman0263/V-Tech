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
    return NextResponse.json(item, { headers: { "Cache-Control": "private, no-store" } });
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
    if (parsed.data.status === "PROCESSED") return NextResponse.json({ error: "Verwerk het document via het uitgavenformulier." }, { status: 409 });
    const current = await db.inboxItem.findFirst({ where: { id, userId: user.accountId }, select: { status: true } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.status === "PROCESSED") return NextResponse.json({ error: "Een verwerkt origineel blijft bij de uitgave bewaard." }, { status: 409 });
    const result = await db.inboxItem.updateMany({
      where: { id, userId: user.accountId, status: { not: "PROCESSED" } },
      data: { status: parsed.data.status, expenseId: null },
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
    const current = await db.inboxItem.findFirst({ where: { id, userId: user.accountId }, select: { status: true } });
    if (current?.status === "PROCESSED") return NextResponse.json({ error: "Het originele document hoort bij een opgeslagen uitgave." }, { status: 409 });
    const result = await db.inboxItem.deleteMany({ where: { id, userId: user.accountId, status: { not: "PROCESSED" } } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
