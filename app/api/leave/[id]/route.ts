import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { decideLeaveSchema } from "@/lib/validations/leave";
import { logAccount } from "@/lib/audit";
import { sendLeaveDecisionEmail } from "@/lib/leave-emails";

// PATCH /api/leave/[id] — goedkeuren/afwijzen (eigenaar/leidinggevende)
// of annuleren (aanvrager zelf, zolang de aanvraag PENDING is).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const accountId = user.accountId;
    const isBoss = user.id === accountId || user.teamRole === "MANAGER";

    const parsed = decideLeaveSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige actie" }, { status: 400 });
    }
    const { action } = parsed.data;

    const request = await db.leaveRequest.findFirst({ where: { id, userId: accountId } });
    if (!request) throw new HttpError(404, "Aanvraag niet gevonden");

    if (action === "CANCEL") {
      const mayCancel = request.requesterId === user.id || isBoss;
      if (!mayCancel) throw new HttpError(403, "Je kunt alleen je eigen aanvraag annuleren.");
      if (request.status === "CANCELLED") return NextResponse.json({ ok: true });
      // Een reeds afgewezen aanvraag valt niet meer te annuleren.
      if (request.status === "REJECTED") throw new HttpError(409, "Deze aanvraag is al behandeld.");
      // Reeds GOEDGEKEURD verlof kan alleen de eigenaar/leidinggevende intrekken —
      // niet de medewerker zelf (anders speelt hij verbruikte uren vrij).
      if (request.status === "APPROVED" && !isBoss) {
        throw new HttpError(409, "Goedgekeurd verlof kan alleen je leidinggevende intrekken.");
      }
    } else {
      if (!isBoss) throw new HttpError(403, "Alleen de eigenaar of een leidinggevende kan beslissen.");
      if (request.status !== "PENDING") throw new HttpError(409, "Deze aanvraag is al behandeld.");
    }

    const status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
    await db.leaveRequest.update({
      where: { id },
      data: { status, decidedById: user.id, decidedAt: new Date() },
    });
    logAccount(accountId, { id: user.id, name: user.name, email: user.email }, `leave.${status.toLowerCase()}`, `aanvraag van ${request.requesterId === user.id ? "zichzelf" : "medewerker"} (${Number(request.hours)}u)`);

    // Statusmail naar de aanvrager bij een echte beslissing (niet bij annuleren,
    // en niet als de beslisser zijn eigen aanvraag afhandelt).
    if ((status === "APPROVED" || status === "REJECTED") && request.requesterId !== user.id) {
      const requester = await db.user.findUnique({
        where: { id: request.requesterId },
        select: { email: true, name: true },
      });
      if (requester?.email) {
        await sendLeaveDecisionEmail({
          to: requester.email,
          requesterName: requester.name ?? requester.email,
          approved: status === "APPROVED",
          type: request.type,
          startDate: request.startDate,
          endDate: request.endDate,
          hours: Number(request.hours),
          decidedByName: user.name ?? user.email ?? null,
        });
      }
    }

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return errorResponse(err);
  }
}
