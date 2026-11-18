import { NextResponse } from "next/server";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { bankActionSchema } from "@/lib/validations/bank";
import { bankMatchError, invoiceStatusAfterUnmatch, isPaidOnline } from "@/lib/bank-matching";
import { serializableTransaction } from "@/lib/transaction";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    assertCan(user, "exports");
    const { id } = await params;
    const parsed = bankActionSchema.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(422, "Kies een geldige actie.");
    await serializableTransaction(async (db) => {
      const transaction = await db.bankTransaction.findFirst({ where: { id, userId: user.accountId } });
      if (!transaction) throw new HttpError(404, "Transactie niet gevonden.");
      const { action } = parsed.data;
      if (action === "ignore" || action === "unmatch") {
        await db.bankTransaction.update({ where: { id, userId: user.accountId }, data: {
          status: action === "ignore" ? "IGNORED" : "UNMATCHED", matchedInvoiceId: null,
        } });
        // Was deze ontvangst de betaling van een factuur? Dan staat die factuur weer open,
        // tenzij hij nog op een andere manier betaald is.
        if (transaction.status === "MATCHED" && transaction.matchedInvoiceId) {
          const invoice = await db.invoice.findFirst({
            where: { id: transaction.matchedInvoiceId, userId: user.accountId },
            select: { id: true, status: true, dueDate: true, invoiceNumber: true },
          });
          if (invoice) {
            const [otherMatched, mollieEvents] = await Promise.all([
              db.bankTransaction.findFirst({
                where: { userId: user.accountId, status: "MATCHED", matchedInvoiceId: invoice.id, NOT: { id } },
                select: { id: true },
              }),
              db.auditLog.findMany({
                where: {
                  accountId: user.accountId, actorName: "Mollie", target: invoice.invoiceNumber,
                  action: { in: ["invoice.payment_received", "invoice.payment_reversed"] },
                },
                select: { action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20,
              }),
            ]);
            const next = invoiceStatusAfterUnmatch(invoice, { otherMatchedTransaction: !!otherMatched, paidOnline: isPaidOnline(mollieEvents) });
            if (next) await db.invoice.update({ where: { id: invoice.id, userId: user.accountId }, data: { status: next } });
          }
        }
      } else {
        const invoiceId = parsed.data.invoiceId ?? transaction.suggestedInvoiceId;
        if (!invoiceId) throw new HttpError(400, "Kies de factuur die bij deze ontvangst hoort.");
        if (transaction.status === "MATCHED") {
          if (transaction.matchedInvoiceId === invoiceId) return;
          throw new HttpError(409, "Deze ontvangst is al gekoppeld. Maak eerst de bestaande koppeling los.");
        }
        const invoice = await db.invoice.findFirst({ where: { id: invoiceId, userId: user.accountId } });
        if (!invoice) throw new HttpError(404, "Factuur niet gevonden.");
        const problem = bankMatchError({ direction: transaction.direction, amount: Number(transaction.amount) }, {
          total: Number(invoice.total), currency: invoice.currency, status: invoice.status,
        });
        if (problem) throw new HttpError(422, problem);
        const previous = await db.bankTransaction.findFirst({ where: {
          userId: user.accountId, status: "MATCHED", matchedInvoiceId: invoiceId, NOT: { id },
        }, select: { id: true } });
        if (previous) throw new HttpError(409, "Deze factuur is al aan een andere ontvangst gekoppeld.");
        await db.bankTransaction.update({ where: { id, userId: user.accountId }, data: { status: "MATCHED", matchedInvoiceId: invoiceId } });
        await db.invoice.update({ where: { id: invoiceId, userId: user.accountId }, data: { status: "PAID" } });
      }
      await db.auditLog.create({ data: {
        platform: false, accountId: user.accountId, actorId: user.id,
        actorName: user.name ?? "Accountgebruiker", action: "bank." + parsed.data.action, target: id,
      } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
