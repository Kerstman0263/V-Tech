import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { updateExpenseSchema } from "@/lib/validations/expense";
import { logAccount } from "@/lib/audit";
import { serializableTransaction } from "@/lib/transaction";
import { verifiedDocumentDataUrl } from "@/lib/document-file";
import { expenseDeleteBlock, expenseEditBlock, expenseLogTarget } from "@/lib/expense-period";

function vatFromGross(gross: number, rate: number) {
  return Math.round(((gross * rate) / (100 + rate)) * 100) / 100;
}

// PATCH /api/expenses/:id — uitgave bijwerken
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateExpenseSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" }, { status: 400 });
    }
    const d = parsed.data;
    const existing = await db.expense.findFirst({ where: { id, userId: user.accountId } });
    if (!existing) throw new HttpError(404, "Uitgave niet gevonden");

    // Bonnetje: een nieuw bonnetje decoderen en de echte inhoud controleren
    // (alleen PNG, JPEG, WebP of pdf tot 2 MB). Het bestaande mag blijven staan.
    const unchanged = d.receipt === undefined || d.receipt === existing.receipt;
    const receipt = unchanged || !d.receipt ? d.receipt : verifiedDocumentDataUrl(d.receipt);
    if (!unchanged && d.receipt && !receipt) {
      return NextResponse.json({ error: "Dit bonnetje kunnen we niet opslaan. Kies een foto (PNG, JPEG of WebP) of een pdf van maximaal 2 MB." }, { status: 400 });
    }

    const amountGross = d.amountGross ?? Number(existing.amountGross);
    const vatRate = d.vatRate ?? Number(existing.vatRate);

    // Btw-tijdvak al aangegeven? Dan geen wijzigingen meer aan wat in de aangifte
    // zit (bedrag, btw, datum, leverancier, bonnetje): zie lib/expense-period.ts.
    const locked = expenseEditBlock(
      { date: existing.date, vendor: existing.vendor, amountGross: Number(existing.amountGross), vatRate: Number(existing.vatRate), receipt: existing.receipt },
      {
        date: d.date ? new Date(`${d.date}T00:00:00Z`) : undefined,
        vendor: d.vendor, amountGross: d.amountGross, vatRate: d.vatRate,
        receipt: unchanged ? undefined : receipt ?? null,
      },
    );
    if (locked) return NextResponse.json({ error: locked.message, code: locked.code, quarter: locked.quarter, year: locked.year }, { status: 409 });

    await db.expense.update({
      where: { id },
      data: {
        ...(d.date ? { date: new Date(`${d.date}T00:00:00Z`) } : {}),
        ...(d.vendor !== undefined ? { vendor: d.vendor } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        amountGross,
        vatRate,
        vatAmount: vatFromGross(amountGross, vatRate),
        ...(!unchanged ? { receipt } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/expenses/:id — uitgave verwijderen. Niet meer als de btw-aangifte
// van het kwartaal al gedaan is (lib/expense-period.ts): dan blijft de uitgave
// met bonnetje bewaard.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const existing = await db.expense.findFirst({
      where: { id, userId: user.accountId },
      select: { id: true, date: true, vendor: true, amountGross: true, vatAmount: true, vatRate: true, receipt: true },
    });
    if (!existing) throw new HttpError(404, "Uitgave niet gevonden");
    const locked = expenseDeleteBlock(existing);
    if (locked) return NextResponse.json({ error: locked.message, code: locked.code, quarter: locked.quarter, year: locked.year }, { status: 409 });
    await serializableTransaction(async (tx) => {
      await tx.inboxItem.updateMany({ where: { userId: user.accountId, expenseId: id }, data: { status: "NEW", expenseId: null } });
      const deleted = await tx.expense.deleteMany({ where: { id, userId: user.accountId } });
      if (deleted.count !== 1) throw new HttpError(404, "Uitgave niet gevonden");
    });
    // Wat er weg is, leesbaar in het logboek: datum, leverancier, bedrag en btw.
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "expense.deleted", expenseLogTarget(existing));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
