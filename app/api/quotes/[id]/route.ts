import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateQuoteStatusSchema } from "@/lib/validations/quote";

// GET /api/quotes/:id — detail (eigen account)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const quote = await db.quote.findFirst({
      where: { id, userId: user.accountId },
      include: { customer: true, lineItems: { orderBy: { position: "asc" } } },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(quote);
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/quotes/:id — status wijzigen
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateQuoteStatusSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige status" }, { status: 422 });
    }
    const result = await db.quote.updateMany({
      where: { id, userId: user.accountId },
      data: { status: parsed.data.status },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/quotes/:id
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const result = await db.quote.deleteMany({ where: { id, userId: user.accountId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
