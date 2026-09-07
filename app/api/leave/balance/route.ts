import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { setBalanceSchema } from "@/lib/validations/leave";

// PATCH /api/leave/balance — verlofbudget (uren/jaar) van een medewerker
// instellen. Alleen voor de eigenaar of een leidinggevende.
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const accountId = user.accountId;
    const isBoss = user.id === accountId || user.teamRole === "MANAGER";
    if (!isBoss) throw new HttpError(403, "Alleen de eigenaar of een leidinggevende kan budgetten instellen.");

    const parsed = setBalanceSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" }, { status: 400 });
    }
    const { employeeId, year, totalHours } = parsed.data;

    // Een leidinggevende mag niet zijn EIGEN budget bepalen — dat is aan de eigenaar.
    if (user.id !== accountId && employeeId === user.id) {
      throw new HttpError(403, "Je eigen verlofbudget wordt door de eigenaar ingesteld.");
    }
    // employeeId moet binnen dit account vallen (eigenaar zelf of een teamlid)
    if (employeeId !== accountId) {
      const member = await db.user.findFirst({ where: { id: employeeId, ownerId: accountId }, select: { id: true } });
      if (!member) throw new HttpError(404, "Medewerker niet gevonden in dit team.");
    }

    await db.leaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      create: { userId: accountId, employeeId, year, totalHours },
      update: { totalHours },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
