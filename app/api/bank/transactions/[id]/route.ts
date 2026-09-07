import { NextResponse } from "next/server";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { bankActionSchema } from "@/lib/validations/bank";
import { bankMatchError } from "@/lib/bank-matching";
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
