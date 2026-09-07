import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { createAssetSchema } from "@/lib/validations/asset";

// GET /api/assets — bezittingen van het account
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const assets = await db.asset.findMany({ where: { userId: user.accountId }, orderBy: { purchaseDate: "desc" } });
    return NextResponse.json(assets);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/assets — nieuwe bezitting
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const parsed = createAssetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const count = await db.asset.count({ where: { userId: user.accountId } });
    if (count >= 1000) return NextResponse.json({ error: "Maximaal 1000 bezittingen." }, { status: 400 });
    const d = parsed.data;
    const asset = await db.asset.create({
      data: {
        userId: user.accountId,
        name: d.name,
        category: d.category,
        purchaseDate: new Date(d.purchaseDate),
        purchasePrice: d.purchasePrice,
        residualValue: d.residualValue,
        usefulLifeMonths: d.usefulLifeMonths,
        disposedAt: d.disposedAt ? new Date(d.disposedAt) : null,
        notes: d.notes || null,
      },
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
