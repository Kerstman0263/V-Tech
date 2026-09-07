import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { PLANS, supportsTeam, seatCost } from "@/lib/plans";
import { addMemberSchema } from "@/lib/validations/team";
import { sendAccountCreatedEmails } from "@/lib/account-emails";
import { logAccount, logPlatform } from "@/lib/audit";
import { can, defaultPermissions, effectivePermissions } from "@/lib/permissions";

// Acterende rol bepalen
async function actor() {
  const user = await requireUser();
  const isOwner = user.id === user.accountId;
  const isManager = can(user, "manageTeam");
  if (!isOwner && !isManager) {
    throw new HttpError(403, "Alleen de eigenaar of een leidinggevende kan het team bekijken.");
  }
  return { user, isOwner, isManager };
}

async function planOf(userId: string) {
  const sub = await db.subscription.findUnique({ where: { userId } });
  return sub?.plan ?? "FREE";
}

// GET /api/team — leden, rollen, seat-info én activiteit per medewerker
export async function GET() {
  try {
    const { user, isOwner } = await actor();
    const accountId = user.accountId;
    const plan = await planOf(accountId);

    const [members, ownerUser, times, miles, invs] = await Promise.all([
      db.user.findMany({
        where: { ownerId: accountId, NOT: { teamRole: "ACCOUNTANT" } }, // boekhouder is geen teamlid/seat
        select: { id: true, name: true, email: true, teamRole: true, createdAt: true, permissions: true, permissionsCustom: true, hourlyCost: true },
        orderBy: { createdAt: "asc" },
      }),
      db.user.findUnique({ where: { id: accountId }, select: { id: true, name: true, email: true, company: { select: { name: true } } } }),
      db.timeEntry.findMany({ where: { userId: accountId }, select: { createdById: true, hours: true, hourlyRate: true } }),
      db.mileageEntry.findMany({ where: { userId: accountId, type: "BUSINESS" }, select: { createdById: true, distanceKm: true } }),
      db.invoice.findMany({ where: { userId: accountId }, select: { createdById: true } }),
    ]);

    // Activiteit per persoon (eigenaar + leden)
    const participants = [
      { id: ownerUser?.id ?? accountId, name: ownerUser?.company?.name ?? ownerUser?.name ?? ownerUser?.email ?? "—", role: "OWNER" as const },
      ...members.map((m) => ({ id: m.id, name: m.name ?? m.email, role: (m.teamRole ?? "MEMBER") as "MEMBER" | "MANAGER" })),
    ];
    // Kosten/marge: bruto uurloon (kostprijs) vs. gefactureerd uurtarief — alleen met financiële rechten
    const showCosts = can(user, "financials");
    const costOf = new Map(members.map((m) => [m.id, m.hourlyCost === null ? null : Number(m.hourlyCost)]));
    const activity = participants.map((p) => ({
      ...p,
      hours: times.filter((t) => t.createdById === p.id).reduce((s, t) => s + Number(t.hours), 0),
      revenue: showCosts ? times.filter((t) => t.createdById === p.id).reduce((s, t) => s + Number(t.hours) * Number(t.hourlyRate ?? 0), 0) : null,
      cost: showCosts && costOf.get(p.id) != null ? times.filter((t) => t.createdById === p.id).reduce((s, t) => s + Number(t.hours) * (costOf.get(p.id) as number), 0) : null,
      km: miles.filter((m) => m.createdById === p.id).reduce((s, m) => s + Number(m.distanceKm), 0),
      invoices: invs.filter((i) => i.createdById === p.id).length,
    }));

    const cfg = PLANS[plan];
    return NextResponse.json({
      plan,
      supportsTeam: supportsTeam(plan),
      maxMembers: cfg.maxMembers,
      seatPrice: cfg.seatPrice,
      used: members.length,
      costPerMonth: seatCost(plan, members.length),
      isOwner,
      showCosts,
      members: members.map((m) => ({
        id: m.id,
        name: m.name ?? m.email,
        email: m.email,
        teamRole: m.teamRole ?? "MEMBER",
        createdAt: m.createdAt.toISOString(),
        // Rechtenmatrix: effectieve rechten + of ze per persoon zijn ingesteld
        permissions: effectivePermissions({ id: m.id, accountId, teamRole: m.teamRole, permissions: m.permissions, permissionsCustom: m.permissionsCustom }),
        permissionsCustom: m.permissionsCustom,
        rolePermissions: defaultPermissions(m.teamRole),
        hourlyCost: showCosts ? (m.hourlyCost === null ? null : Number(m.hourlyCost)) : null,
      })),
      activity,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/team — medewerker toevoegen
export async function POST(req: Request) {
  try {
    const { user, isOwner } = await actor();
    const accountId = user.accountId;
    const plan = await planOf(accountId);

    if (!supportsTeam(plan)) {
      throw new HttpError(402, "Teamleden zijn beschikbaar vanaf het Pro-abonnement.");
    }
    const count = await db.user.count({ where: { ownerId: accountId, NOT: { teamRole: "ACCOUNTANT" } } });
    if (count >= PLANS[plan].maxMembers) {
      throw new HttpError(402, "Je hebt het maximale aantal medewerkers bereikt voor dit abonnement.");
    }

    const parsed = addMemberSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const { name, email, password } = parsed.data;
    // Alleen de eigenaar mag een leidinggevende aanmaken
    const teamRole = isOwner ? parsed.data.teamRole : "MEMBER";

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "E-mail al in gebruik" }, { status: 409 });

    const passwordHash = await bcrypt.hash(password, 12);
    const member = await db.user.create({
      data: { email, passwordHash, name, role: "USER", ownerId: accountId, teamRole },
      select: { id: true, email: true, name: true, teamRole: true },
    });

    logAccount(accountId, { id: user.id, name: user.name, email: user.email }, "team.member_added", `${name} (${email}, ${teamRole})`);
    logPlatform({ id: user.id, email: user.email }, "team.member_added", `${email} bij account ${accountId}`);

    await sendAccountCreatedEmails({ email, companyName: name, source: "team" });

    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
