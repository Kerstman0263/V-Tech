import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { can } from "@/lib/permissions";
import { updateTimeEntrySchema } from "@/lib/validations/time";
import { approvalAfterEdit, canBill, isSubstantiveEdit } from "@/lib/time-approval";
import { assertOwnedRefs } from "@/lib/ownership";

// Een medewerker mag alleen zijn eigen registraties raken; eigenaar/manager alles.
function ownScope(user: { id: string; accountId: string; role?: string | null; teamRole?: string | null }) {
  return can(user, "manageTeam") ? {} : { createdById: user.id };
}

// PATCH /api/time-entries/:id — bewerken of status naar BILLED zetten
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = updateTimeEntrySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const isManager = can(user, "manageTeam");

    const entry = await db.timeEntry.findFirst({
      where: { id, userId: user.accountId, ...ownScope(user) },
      select: { status: true, approval: true, invoiceId: true },
    });
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertOwnedRefs(user.accountId, parsed.data);
    if (entry.invoiceId) throw new HttpError(409, "Deze uren staan op een factuur en kunnen niet meer worden gewijzigd.");
    if (parsed.data.status && !can(user, "financials")) throw new HttpError(403, "Alleen iemand met facturatierechten kan de facturatiestatus wijzigen.");

    // Gefactureerde uren zijn bevroren voor medewerkers.
    if (entry.status === "BILLED" && !isManager) {
      throw new HttpError(409, "Gefactureerde uren kun je niet meer wijzigen.");
    }
    // Factureren kan pas na goedkeuring.
    if (parsed.data.status === "BILLED" && !canBill(entry.approval)) {
      throw new HttpError(409, "Deze uren zijn nog niet goedgekeurd en kunnen niet gefactureerd worden.");
    }

    // Inhoudelijke wijziging door een medewerker -> opnieuw ter beoordeling.
    const nextApproval = isSubstantiveEdit(parsed.data) ? approvalAfterEdit(entry.approval, isManager) : entry.approval;
    const resetReview = nextApproval !== entry.approval;

    const changed = await db.timeEntry.updateMany({
      where: { id, userId: user.accountId, ...ownScope(user), status: entry.status, invoiceId: null },
      data: {
        ...parsed.data,
        ...(resetReview ? { approval: nextApproval, approvedById: null, approvedAt: null, rejectReason: null } : {}),
      },
    });
    if (!changed.count) throw new HttpError(409, "Deze uren zijn ondertussen gewijzigd. Vernieuw de pagina en probeer opnieuw.");
    return NextResponse.json({ ok: true, approval: nextApproval });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/time-entries/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await db.timeEntry.deleteMany({ where: { id, userId: user.accountId, ...ownScope(user), status: "OPEN", invoiceId: null } });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
