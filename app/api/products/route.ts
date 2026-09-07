import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { productSchema } from "@/lib/validations/product";

// GET /api/products?all=1 — catalogus van het account (standaard alleen actieve)
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const all = new URL(req.url).searchParams.get("all") === "1";
    const products = await db.product.findMany({
      where: { userId: user.accountId, ...(all ? {} : { active: true }) },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    return NextResponse.json(products);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/products — nieuw product/dienst
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const parsed = productSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const count = await db.product.count({ where: { userId: user.accountId } });
    if (count >= 500) return NextResponse.json({ error: "Maximaal 500 producten." }, { status: 400 });

    const d = parsed.data;
    const product = await db.product.create({
      data: {
        userId: user.accountId,
        name: d.name,
        description: d.description || null,
        unitPrice: d.unitPrice,
        vatRate: d.vatRate,
        unit: d.unit || null,
        active: d.active ?? true,
      },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
