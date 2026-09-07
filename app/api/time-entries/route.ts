import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertOwnedRefs } from "@/lib/ownership";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { planHasFeature } from "@/lib/plans";
import { can } from "@/lib/permissions";
import { createTimeEntrySchema } from "@/lib/validations/time";
import { initialApproval } from "@/lib/time-approval";

// GET /api/time-entries — uren van de gebruiker (optioneel filter op status/goedkeuring)
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status");
    const approval = sp.get("approval");
    const customerId = sp.get("customerId");
    // Wie alle uren ziet: teambeheer óf uren-goedkeuring
    const isManager = can(user, "manageTeam") || can(user, "approveHours");

    const [entries, people] = await Promise.all([
      db.timeEntry.findMany({
        where: {
          userId: user.accountId,
          // Medewerkers zien alleen hun eigen uren; eigenaar/leidinggevende alles.
          ...(isManager ? {} : { createdById: user.id }),
          ...(status === "OPEN" || status === "BILLED" ? { status } : {}),
          ...(approval === "PENDING" || approval === "APPROVED" || approval === "REJECTED" ? { approval } : {}),
          ...(customerId ? { customerId } : {}),
        },
        include: {
          project: { select: { name: true } },
          customer: { select: { name: true } },
        },
        orderBy: { date: "desc" },
      }),
      // Namen van teamleden (voor "wie registreerde dit") — alleen nodig voor managers.
      isManager
        ? db.user.findMany({ where: { OR: [{ id: user.accountId }, { ownerId: user.accountId }] }, select: { id: true, name: true, email: true } })
        : Promise.resolve([] as { id: string; name: string | null; email: string }[]),
    ]);
    const nameOf = new Map(people.map((p) => [p.id, p.name || p.email]));
    return NextResponse.json(entries.map((e) => ({ ...e, createdByName: e.createdById ? (nameOf.get(e.createdById) ?? null) : null })));
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/time-entries — uren loggen
export async function POST(req: Request) {
  try {
    const user = await requireUser();

    // Feature-gate: urenregistratie zit niet in het gratis plan
    const [sub, company] = await Promise.all([
      db.subscription.findUnique({ where: { userId: user.accountId } }),
      db.company.findUnique({ where: { userId: user.accountId }, select: { accountType: true } }),
    ]);
    if (!planHasFeature(sub?.plan ?? "FREE", "timeTracking")) {
      throw new HttpError(402, "Urenregistratie vereist een Groei- of Pro-abonnement.");
    }

    const parsed = createTimeEntrySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const data = parsed.data;

    await assertOwnedRefs(user.accountId, { customerId: data.customerId, projectId: data.projectId });

    const entry = await db.timeEntry.create({
      data: {
        userId: user.accountId,
        createdById: user.id,
        projectId: data.projectId || null,
        customerId: data.customerId || null,
        date: data.date ?? new Date(),
        hours: data.hours,
        hourlyRate: data.hourlyRate ?? null,
        description: data.description,
        status: "OPEN",
        // Medewerker-uren in een bedrijfsaccount gaan eerst ter beoordeling.
        approval: initialApproval({ isBedrijf: company?.accountType === "BEDRIJF", isManager: can(user, "manageTeam") }),
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
