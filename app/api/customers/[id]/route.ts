import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { encrypt } from "@/lib/encryption";
import { updateCustomerSchema } from "@/lib/validations/invoice";

// PATCH /api/customers/:id — klant bewerken
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateCustomerSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const d = parsed.data;

    const result = await db.customer.updateMany({
      where: { id, userId: user.accountId },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.email !== undefined ? { email: d.email || null } : {}),
        ...(d.address !== undefined ? { address: encrypt(d.address) } : {}),
        ...(d.postalCode !== undefined ? { postalCode: d.postalCode || null } : {}),
        ...(d.city !== undefined ? { city: d.city || null } : {}),
        ...(d.country !== undefined ? { country: d.country || "NL" } : {}),
        ...(d.vatNumber !== undefined ? { vatNumber: d.vatNumber || null } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/customers/:id — klant verwijderen (geblokkeerd als er facturen zijn)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;

    const customer = await db.customer.findFirst({ where: { id, userId: user.accountId } });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
      await db.customer.delete({ where: { id } });
    } catch (e) {
      // Foreign key restrict: klant heeft nog facturen (bewaarplicht)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return NextResponse.json({ error: "HAS_INVOICES" }, { status: 409 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
