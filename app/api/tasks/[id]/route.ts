import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertOwnedRefs } from "@/lib/ownership";
import { can } from "@/lib/permissions";
import { updateTaskSchema } from "@/lib/validations/task";
import { logAccount } from "@/lib/audit";

// Is dit id een geldig teamlid (of de eigenaar) van dit account?
async function isTeamUser(accountId: string, id: string) {
  if (id === accountId) return true;
  const u = await db.user.findFirst({ where: { id, ownerId: accountId }, select: { id: true } });
  return !!u;
}

// PATCH /api/tasks/:id — taak bijwerken / afvinken (+ uren klaarzetten)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = updateTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const d = parsed.data;

    const task = await db.task.findFirst({ where: { id, userId: user.accountId } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Rechten: eigenaar/leidinggevende mag elke taak; een medewerker alleen
    // taken die aan hem zijn toegewezen of die hij zelf aanmaakte.
    const isBoss = can(user, "manageTeam");
    const mayEdit = isBoss || task.assignedToId === user.id || task.createdById === user.id;
    if (!mayEdit) throw new HttpError(403, "Geen rechten om deze taak te wijzigen.");

    // Alleen een leidinggevende mag (her)toewijzen, en alleen aan een teamlid.
    if (d.assignedToId !== undefined) {
      if (!isBoss) throw new HttpError(403, "Alleen een leidinggevende kan taken toewijzen.");
      const target = d.assignedToId || null;
      if (target && !(await isTeamUser(user.accountId, target))) {
        return NextResponse.json({ error: "Ongeldige medewerker" }, { status: 422 });
      }
    }

    const goingDone = d.status === "DONE" && task.status !== "DONE";
    const hours = d.hours ?? (task.hours != null ? Number(task.hours) : 0);

    await assertOwnedRefs(user.accountId, { customerId: d.customerId, projectId: d.projectId });

    await db.task.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.assignedToId !== undefined ? { assignedToId: d.assignedToId || null } : {}),
        ...(d.dueDate !== undefined ? { dueDate: d.dueDate ?? null } : {}),
        ...(d.projectId !== undefined ? { projectId: d.projectId || null } : {}),
        ...(d.customerId !== undefined ? { customerId: d.customerId || null } : {}),
        ...(d.hours !== undefined ? { hours: d.hours } : {}),
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        ...(d.status !== undefined
          ? { status: d.status, completedAt: d.status === "DONE" ? new Date() : null }
          : {}),
      },
    });

    // "Uren klaarzetten": bij afronden de uren als registratie aanmaken
    if (goingDone && d.logHours && hours > 0) {
      await db.timeEntry.create({
        data: {
          userId: user.accountId,
          createdById: task.assignedToId ?? user.id,
          projectId: task.projectId,
          customerId: task.customerId,
          hours,
          description: task.title,
          status: "OPEN",
        },
      });
    }

    if (d.status !== undefined) {
      logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, d.status === "DONE" ? "task.completed" : d.status === "IN_PROGRESS" ? "task.started" : "task.reopened", task.title);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/tasks/:id — taak verwijderen (eigenaar/leidinggevende of de aanmaker)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const task = await db.task.findFirst({ where: { id, userId: user.accountId } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = user.id === user.accountId;
    const isManager = user.teamRole === "MANAGER";
    const isCreator = task.createdById === user.id;
    if (!isOwner && !isManager && !isCreator) {
      throw new HttpError(403, "Geen rechten om deze taak te verwijderen.");
    }

    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
