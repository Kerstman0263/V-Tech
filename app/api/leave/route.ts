import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { createLeaveSchema } from "@/lib/validations/leave";
import { logAccount } from "@/lib/audit";
import { sendLeaveRequestedEmail } from "@/lib/leave-emails";

/** Standaard verlofbudget (uren/jaar) als er geen LeaveBalance-record is. */
const DEFAULT_LEAVE_HOURS = 200;

// GET /api/leave — aanvragen + saldo's binnen het account.
// Eigenaar/leidinggevende ziet alles; een medewerker alleen zichzelf.
export async function GET() {
  try {
    const user = await requireUser();
    const accountId = user.accountId;
    const isBoss = user.id === accountId || user.teamRole === "MANAGER";
    const year = new Date().getFullYear();

    const [requests, balances, members, owner] = await Promise.all([
      db.leaveRequest.findMany({
        where: { userId: accountId, ...(isBoss ? {} : { requesterId: user.id }) },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      db.leaveBalance.findMany({ where: { userId: accountId, year } }),
      db.user.findMany({
        where: { ownerId: accountId },
        select: { id: true, name: true, email: true },
        orderBy: { createdAt: "asc" },
      }),
      db.user.findUnique({
        where: { id: accountId },
        select: { id: true, name: true, email: true, company: { select: { name: true } } },
      }),
    ]);

    const people = [
      { id: accountId, name: owner?.name ?? owner?.company?.name ?? owner?.email ?? "Eigenaar" },
      ...members.map((m) => ({ id: m.id, name: m.name ?? m.email })),
    ];
    const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "—";

    // Verlofbudget per persoon: alleen goedgekeurde VAKANTIE van dit jaar telt mee.
    const inYear = (d: Date) => d.getFullYear() === year;
    const summary = (isBoss ? people : people.filter((p) => p.id === user.id)).map((p) => {
      const mine = requests.filter((r) => r.requesterId === p.id && r.type === "VACATION" && inYear(r.startDate));
      const used = mine.filter((r) => r.status === "APPROVED").reduce((s, r) => s + Number(r.hours), 0);
      const pending = mine.filter((r) => r.status === "PENDING").reduce((s, r) => s + Number(r.hours), 0);
      const total = Number(balances.find((b) => b.employeeId === p.id)?.totalHours ?? DEFAULT_LEAVE_HOURS);
      return { employeeId: p.id, name: p.name, totalHours: total, usedHours: used, pendingHours: pending, remainingHours: total - used };
    });

    return NextResponse.json({
      isBoss,
      year,
      meId: user.id,
      requests: requests.map((r) => ({
        id: r.id,
        requesterId: r.requesterId,
        requesterName: nameOf(r.requesterId),
        type: r.type,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        hours: Number(r.hours),
        note: r.note,
        status: r.status,
        decidedBy: r.decidedById ? nameOf(r.decidedById) : null,
        createdAt: r.createdAt.toISOString(),
      })),
      balances: summary,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/leave — nieuwe verlofaanvraag.
// Eigenaar/leidinggevende: direct goedgekeurd (eigen verlof registreren).
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const accountId = user.accountId;
    const parsed = createLeaveSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" }, { status: 400 });
    }
    const d = parsed.data;
    const isBoss = user.id === accountId || user.teamRole === "MANAGER";

    // Budgetcontrole: een medewerker kan geen vakantie aanvragen die zijn
    // resterende verlofsaldo overschrijdt (voorkomt een negatief saldo).
    if (!isBoss && d.type === "VACATION") {
      const y = Number(d.startDate.slice(0, 4));
      const [balance, agg] = await Promise.all([
        db.leaveBalance.findUnique({ where: { employeeId_year: { employeeId: user.id, year: y } }, select: { totalHours: true } }),
        db.leaveRequest.aggregate({
          where: {
            userId: accountId, requesterId: user.id, type: "VACATION", status: "APPROVED",
            startDate: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) },
          },
          _sum: { hours: true },
        }),
      ]);
      const total = Number(balance?.totalHours ?? 200);
      const used = Number(agg._sum.hours ?? 0);
      const remaining = total - used;
      if (d.hours > remaining) {
        return NextResponse.json(
          { error: `Onvoldoende verlofsaldo: nog ${remaining} u beschikbaar, je vroeg ${d.hours} u aan.` },
          { status: 400 },
        );
      }
    }

    const created = await db.leaveRequest.create({
      data: {
        userId: accountId,
        requesterId: user.id,
        type: d.type,
        startDate: new Date(`${d.startDate}T00:00:00Z`),
        endDate: new Date(`${d.endDate}T00:00:00Z`),
        hours: d.hours,
        note: d.note || null,
        ...(isBoss ? { status: "APPROVED" as const, decidedById: user.id, decidedAt: new Date() } : {}),
      },
    });
    logAccount(accountId, { id: user.id, name: user.name, email: user.email }, isBoss ? "leave.registered" : "leave.requested", `${d.type} ${d.startDate} t/m ${d.endDate} (${d.hours}u)`);

    // Alleen bij een échte aanvraag (medewerker) gaat er een mail naar de
    // eigenaar/leidinggevende. Eigen verlof van de baas is direct goedgekeurd.
    if (!isBoss) {
      await sendLeaveRequestedEmail({
        accountId,
        requesterId: user.id,
        requesterName: user.name ?? user.email ?? "Een medewerker",
        type: d.type,
        startDate: created.startDate,
        endDate: created.endDate,
        hours: Number(created.hours),
        note: d.note,
      });
    }

    return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
