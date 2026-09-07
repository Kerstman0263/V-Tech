import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { logAccount } from "@/lib/audit";
import { sendTimeDecisionEmail } from "@/lib/time-emails";

const decideTimeSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().max(300).optional(),
});

// POST /api/time-entries/approval — uren goedkeuren/afkeuren (eigenaar/leidinggevende).
// Werkt op één of meerdere registraties tegelijk ("alles goedkeuren").
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "approveHours");

    const parsed = decideTimeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const { ids, decision, reason } = parsed.data;
    if (decision === "REJECTED" && !reason) throw new HttpError(422, "Geef een reden op bij afkeuren.");

    // Alleen registraties van dit account die daadwerkelijk beoordeeld moeten worden
    // (PENDING, of een eerdere beslissing herzien). Nooit eigen NOT_REQUIRED-uren.
    const targets = await db.timeEntry.findMany({
      where: { id: { in: ids }, userId: user.accountId, approval: { in: ["PENDING", "APPROVED", "REJECTED"] }, status: "OPEN" },
      select: { id: true, hours: true, createdById: true, approval: true },
    });
    const todo = targets.filter((t) => t.approval !== decision);
    if (todo.length === 0) return NextResponse.json({ ok: true, updated: 0 });

    const now = new Date();
    await db.timeEntry.updateMany({
      where: { id: { in: todo.map((t) => t.id) } },
      data: { approval: decision, approvedById: user.id, approvedAt: now, rejectReason: decision === "REJECTED" ? reason ?? null : null },
    });

    const totalHours = todo.reduce((s, t) => s + Number(t.hours), 0);
    logAccount(
      user.accountId,
      { id: user.id, name: user.name, email: user.email },
      decision === "APPROVED" ? "time.approved" : "time.rejected",
      `${todo.length} registratie${todo.length === 1 ? "" : "s"} (${totalHours.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}u)${reason ? ` — ${reason}` : ""}`,
    );

    // Eén samenvattende mail per medewerker (niet naar de beslisser zelf). Fire-and-forget.
    const perMember = new Map<string, { hours: number; count: number }>();
    for (const t of todo) {
      if (!t.createdById || t.createdById === user.id) continue;
      const cur = perMember.get(t.createdById) ?? { hours: 0, count: 0 };
      cur.hours += Number(t.hours);
      cur.count += 1;
      perMember.set(t.createdById, cur);
    }
    if (perMember.size > 0) {
      const members = await db.user.findMany({ where: { id: { in: [...perMember.keys()] } }, select: { id: true, email: true, name: true, locale: true } });
      for (const m of members) {
        const agg = perMember.get(m.id);
        if (!agg || !m.email) continue;
        sendTimeDecisionEmail({
          to: m.email,
          memberName: m.name || m.email,
          locale: m.locale,
          approved: decision === "APPROVED",
          totalHours: agg.hours,
          count: agg.count,
          decidedByName: user.name ?? user.email ?? null,
          reason,
        }).catch((e) => console.error("[time] beslissingsmail mislukt:", e?.message));
      }
    }

    return NextResponse.json({ ok: true, updated: todo.length });
  } catch (err) {
    return errorResponse(err);
  }
}
