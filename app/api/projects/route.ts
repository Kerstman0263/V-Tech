import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { createProjectSchema } from "@/lib/validations/project";

// GET /api/projects — projecten van de gebruiker
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const projects = await db.project.findMany({
      where: { userId: user.accountId },
      include: {
        customer: { select: { name: true } },
        _count: { select: { timeEntries: true, mileage: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(projects);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/projects — nieuw project
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const parsed = createProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const data = parsed.data;

    // Controleer dat de (optionele) klant van deze gebruiker is
    if (data.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: data.customerId, userId: user.accountId },
      });
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
    }

    const project = await db.project.create({
      data: {
        userId: user.accountId,
        name: data.name,
        customerId: data.customerId || null,
        description: data.description || null,
        hourlyRate: data.hourlyRate ?? null,
      },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
