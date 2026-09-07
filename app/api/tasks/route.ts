import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertOwnedRefs } from "@/lib/ownership";
import { can } from "@/lib/permissions";
import { createTaskSchema } from "@/lib/validations/task";
import { logAccount } from "@/lib/audit";

// Bepaalt of een id een geldig teamlid (of de eigenaar) van dit account is.
async function isTeamUser(accountId: string, id: string) {
  if (id === accountId) return true;
  const u = await db.user.findFirst({ where: { id, ownerId: accountId }, select: { id: true } });
  return !!u;
}

// GET /api/tasks — taken van het team (optioneel filter op toegewezen persoon/status)
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const assignedTo = sp.get("assignedTo"); // "me" of een userId
    const status = sp.get("status");

    // Een medewerker ziet ALLEEN zijn eigen taken — ongeacht de filterparameter.
    // Eigenaar/leidinggevende mag filteren op iedereen.
    const isBoss = can(user, "manageTeam");
    const assignedScope = !isBoss
      ? { assignedToId: user.id }
      : assignedTo === "me"
        ? { assignedToId: user.id }
        : assignedTo
          ? { assignedToId: assignedTo }
          : {};

    const tasks = await db.task.findMany({
      where: {
        userId: user.accountId,
        ...assignedScope,
        ...(status === "TODO" || status === "IN_PROGRESS" || status === "DONE" ? { status } : {}),
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    });

    // Namen van team, projecten en klanten voor weergave
    const [members, owner, projects, customers] = await Promise.all([
      db.user.findMany({ where: { ownerId: user.accountId }, select: { id: true, name: true, email: true } }),
      db.user.findUnique({ where: { id: user.accountId }, select: { id: true, name: true, email: true, company: { select: { name: true } } } }),
      db.project.findMany({ where: { userId: user.accountId }, select: { id: true, name: true } }),
      db.customer.findMany({ where: { userId: user.accountId }, select: { id: true, name: true } }),
    ]);
    const nameMap = new Map<string, string>();
    if (owner) nameMap.set(owner.id, owner.company?.name ?? owner.name ?? owner.email);
    members.forEach((m) => nameMap.set(m.id, m.name ?? m.email));
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const customerMap = new Map(customers.map((c) => [c.id, c.name]));

    return NextResponse.json(
      tasks.map((t) => ({
        ...t,
        hours: t.hours != null ? Number(t.hours) : null,
        dueDate: t.dueDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
        assignedToName: t.assignedToId ? (nameMap.get(t.assignedToId) ?? "—") : null,
        projectName: t.projectId ? (projectMap.get(t.projectId) ?? null) : null,
        customerName: t.customerId ? (customerMap.get(t.customerId) ?? null) : null,
      })),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/tasks — nieuwe taak (elk teamlid mag aanmaken/toewijzen)
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = createTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const d = parsed.data;

    // Toegewezen persoon moet bij dit team horen (of niemand)
    const assignedToId = d.assignedToId || null;
    if (assignedToId && !(await isTeamUser(user.accountId, assignedToId))) {
      return NextResponse.json({ error: "Ongeldige medewerker" }, { status: 422 });
    }

    // Tenant-check: klant/project moeten van dit account zijn (voorkomt cross-tenant lek via joins)
    await assertOwnedRefs(user.accountId, { customerId: d.customerId, projectId: d.projectId });

    const task = await db.task.create({
      data: {
        userId: user.accountId,
        createdById: user.id,
        assignedToId,
        title: d.title,
        description: d.description || null,
        dueDate: d.dueDate ?? null,
        projectId: d.projectId || null,
        customerId: d.customerId || null,
        hours: d.hours ?? null,
        priority: d.priority,
      },
    });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "task.created", d.title);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
