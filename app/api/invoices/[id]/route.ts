import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateInvoiceStatusSchema } from "@/lib/validations/invoice";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { invoiceStatusTransitionError, isIssuedInvoice, isLatestInvoiceNumber, paidAtUpdate } from "@/lib/invoice-status";
import { prepareIssue } from "@/lib/invoice-snapshot";
import { markOriginalCredited } from "@/lib/invoice-credit";

const VOIDED_DRAFT_NOTE = "Vervallen concept";

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

/**
 * Een concept dat niet doorgaat geeft zijn uren en zijn offerte vrij, zodat
 * die opnieuw gefactureerd of omgezet kunnen worden. Een concept-creditfactuur
 * heeft het origineel nog niet op gecrediteerd gezet (dat gebeurt pas bij het
 * uitreiken), dus daar hoeft niets terug.
 */
async function releaseDraftLinks(
  tx: Prisma.TransactionClient,
  accountId: string,
  invoice: { id: string },
) {
  const invoiceId = invoice.id;
  await tx.timeEntry.updateMany({ where: { userId: accountId, invoiceId }, data: { invoiceId: null, status: "OPEN" } });
  await tx.quote.updateMany({
    where: { userId: accountId, convertedInvoiceId: invoiceId },
    data: { convertedInvoiceId: null, status: "ACCEPTED" },
  });
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
      const problem = invoiceStatusTransitionError(invoice.status, next);
      if (problem) throw new HttpError(409, problem);
      // Uitreiken (concept -> verzonden/betaald): gegevens vastzetten zoals ze nu zijn.
      let snapshot: Prisma.InputJsonValue | undefined;
      if (invoice.status === "DRAFT" && isIssuedInvoice(next)) {
        const issue = await prepareIssue(tx, user.accountId, id);
        if (issue.problem) throw new HttpError(422, issue.problem);
        snapshot = issue.snapshot;
      }
      // Op betaald gezet: vandaag is de betaaldatum (voor de auditfile). Weer open: geen betaaldatum.
      await tx.invoice.update({ where: { id }, data: { status: next, ...(snapshot ? { snapshot } : {}), ...paidAtUpdate(invoice.status, next) } });
      // Een creditfactuur wordt uitgereikt: pas nu staat het origineel niet meer open.
      if (invoice.status === "DRAFT" && isIssuedInvoice(next)) await markOriginalCredited(tx, user.accountId, invoice);
      if (next === "CANCELED") await releaseDraftLinks(tx, user.accountId, invoice);
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

// DELETE /api/invoices/:id — concept verwijderen zonder gat in de nummering.
// Is het concept het laatst uitgegeven nummer, dan verdwijnt het en schuift de
// teller één terug. Anders blijft het nummer bestaan als "vervallen concept".
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;

    const outcome = await serializableTransaction(async (tx) => {
      // Vergrendel eerst de nummerteller van dit account (rij-lock tot commit),
      // zodat er tussendoor geen nieuw nummer uitgegeven kan worden.
      await tx.invoiceSettings.updateMany({ where: { userId: user.accountId }, data: { nextNumber: { increment: 0 } } });
      const settings = await tx.invoiceSettings.findUnique({ where: { userId: user.accountId } });
      const invoice = await tx.invoice.findFirst({ where: { id, userId: user.accountId } });
      if (!invoice) throw new HttpError(404, "Factuur niet gevonden.");
      if (invoice.status !== "DRAFT") throw new HttpError(409, "Alleen een concept kan worden verwijderd. Bewaar een uitgereikte factuur en maak zo nodig een creditfactuur.");
      await releaseDraftLinks(tx, user.accountId, invoice);

      if (settings && isLatestInvoiceNumber(invoice.invoiceNumber, settings)) {
        await tx.invoice.delete({ where: { id } });
        await tx.invoiceSettings.update({ where: { userId: user.accountId }, data: { nextNumber: { decrement: 1 } } });
        await tx.auditLog.create({ data: {
          accountId: user.accountId, actorId: user.id, actorName: user.name ?? "Accountgebruiker",
          action: "invoice.draft_deleted", target: invoice.invoiceNumber,
        } });
        return "deleted" as const;
      }

      await tx.invoice.update({
        where: { id },
        data: {
          status: "CANCELED",
          notes: [VOIDED_DRAFT_NOTE, invoice.notes].filter(Boolean).join("\n\n"),
        },
      });
      await tx.auditLog.create({ data: {
        accountId: user.accountId, actorId: user.id, actorName: user.name ?? "Accountgebruiker",
        action: "invoice.draft_voided", target: invoice.invoiceNumber,
      } });
      return "canceled" as const;
    });
    return NextResponse.json({ ok: true, deleted: outcome === "deleted", canceled: outcome === "canceled" });
  } catch (err) {
    return errorResponse(err);
  }
}
