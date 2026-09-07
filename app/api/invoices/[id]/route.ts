import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateInvoiceStatusSchema } from "@/lib/validations/invoice";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";

// GET /api/invoices/:id — één factuur ophalen
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;

    const invoice = await db.invoice.findFirst({
      where: { id, userId: user.accountId },
      include: { customer: true, lineItems: { orderBy: { position: "asc" } } },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/invoices/:id — status wijzigen (concept/verzonden/betaald/...)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateInvoiceStatusSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige status" }, { status: 422 });
    }

    await serializableTransaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id, userId: user.accountId } });
      if (!invoice) throw new HttpError(404, "Factuur niet gevonden.");
      const next = parsed.data.status;
      if (invoice.status === next) return;
      if (next === "DRAFT") throw new HttpError(409, "Een uitgereikte factuur kan niet terug naar concept. Maak zo nodig een creditfactuur.");
      await tx.invoice.update({ where: { id }, data: { status: next } });
      await tx.auditLog.create({ data: {
        accountId: user.accountId, actorId: user.id, actorName: user.name ?? "Accountgebruiker",
        action: "invoice.status_changed", target: `${invoice.invoiceNumber}: ${invoice.status} → ${next}`,
      } });
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/invoices/:id — factuur verwijderen
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;

    await serializableTransaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id, userId: user.accountId } });
      if (!invoice) throw new HttpError(404, "Factuur niet gevonden.");
      if (invoice.status !== "DRAFT") throw new HttpError(409, "Alleen een concept kan worden verwijderd. Bewaar een uitgereikte factuur en maak zo nodig een creditfactuur.");
      await tx.timeEntry.updateMany({ where: { userId: user.accountId, invoiceId: id }, data: { invoiceId: null, status: "OPEN" } });
      await tx.invoice.delete({ where: { id } });
      await tx.auditLog.create({ data: {
        accountId: user.accountId, actorId: user.id, actorName: user.name ?? "Accountgebruiker",
        action: "invoice.draft_deleted", target: invoice.invoiceNumber,
      } });
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
