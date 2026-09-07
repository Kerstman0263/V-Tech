import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertOwnedRefs } from "@/lib/ownership";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { planHasFeature } from "@/lib/plans";
import { can } from "@/lib/permissions";
import { createMileageSchema } from "@/lib/validations/mileage";

// GET /api/mileage — ritten van de gebruiker (optioneel filter op type)
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const type = new URL(req.url).searchParams.get("type");

    const entries = await db.mileageEntry.findMany({
      where: {
        userId: user.accountId,
        // Medewerkers zien alleen hun eigen ritten; eigenaar/leidinggevende alles.
        ...(can(user, "manageTeam") ? {} : { createdById: user.id }),
        ...(type === "BUSINESS" || type === "PRIVATE" ? { type } : {}),
      },
      include: { project: { select: { name: true } } },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(entries);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/mileage — rit loggen
export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const sub = await db.subscription.findUnique({ where: { userId: user.accountId } });
    if (!planHasFeature(sub?.plan ?? "FREE", "mileageTracking")) {
      throw new HttpError(402, "Rittenregistratie vereist een Groei- of Pro-abonnement.");
    }

    const parsed = createMileageSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const data = parsed.data;

    await assertOwnedRefs(user.accountId, { projectId: data.projectId });

    const entry = await db.mileageEntry.create({
      data: {
        userId: user.accountId,
        createdById: user.id,
        projectId: data.projectId || null,
        date: data.date ?? new Date(),
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        distanceKm: data.distanceKm,
        type: data.type,
        ratePerKm: data.ratePerKm ?? 0.23,
        description: data.description || null,
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
