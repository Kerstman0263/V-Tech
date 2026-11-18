import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { createExpenseSchema } from "@/lib/validations/expense";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";

// BTW-deel van een bruto bedrag (bedrag is incl. BTW)
function vatFromGross(gross: number, rate: number) {
  return Math.round(((gross * rate) / (100 + rate)) * 100) / 100;
}

// GET /api/expenses?year=2026 — uitgaven van het account (nieuwste eerst)
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { searchParams } = new URL(req.url);
    const rawYear = Number(searchParams.get("year"));
    const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100 ? rawYear : new Date().getFullYear();

    const expenses = await db.expense.findMany({
      where: {
        userId: user.accountId,
        date: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) },
      },
      orderBy: { date: "desc" },
      take: 500,
    });

    const originals = await db.inboxItem.findMany({ where: { userId: user.accountId, expenseId: { in: expenses.map((expense) => expense.id) }, status: "PROCESSED" }, select: { id: true, expenseId: true } });
    const originalIds = new Map(originals.map((item) => [item.expenseId, item.id]));
    return NextResponse.json(
      expenses.map((e) => ({
        id: e.id,
        originalUrl: originalIds.has(e.id) ? `/api/inbox/${originalIds.get(e.id)}/file` : null,
        date: e.date.toISOString().slice(0, 10),
        vendor: e.vendor,
        description: e.description,
        category: e.category,
        amountGross: Number(e.amountGross),
        vatRate: Number(e.vatRate),
        vatAmount: Number(e.vatAmount),
        hasReceipt: !!e.receipt,
        receipt: e.receipt,
      })),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/expenses — nieuwe uitgave
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const parsed = createExpenseSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" }, { status: 400 });
    }
    const d = parsed.data;

    const created = await serializableTransaction(async (tx) => {
      const inbox = d.inboxItemId ? await tx.inboxItem.findFirst({ where: { id: d.inboxItemId, userId: user.accountId }, select: { id: true, status: true, expenseId: true } }) : null;
      if (d.inboxItemId && !inbox) throw new HttpError(404, "Document niet gevonden.");
      if (inbox?.status === "PROCESSED" && inbox.expenseId) {
        const existing = await tx.expense.findFirst({ where: { id: inbox.expenseId, userId: user.accountId }, select: { id: true } });
        if (existing) return { ...existing, replayed: true };
      }
      if (inbox && inbox.status !== "NEW") throw new HttpError(409, "Dit document is al verwerkt of opzijgezet. Vernieuw de inbox.");
      const expense = await tx.expense.create({
      data: {
        userId: user.accountId,
        createdById: user.id,
        date: new Date(`${d.date}T00:00:00Z`),
        vendor: d.vendor,
        description: d.description || null,
        category: d.category,
        amountGross: d.amountGross,
        vatRate: d.vatRate,
        vatAmount: vatFromGross(d.amountGross, d.vatRate),
        receipt: d.receipt ?? null,
      },
      select: { id: true },
      });
      if (inbox) {
        const claimed = await tx.inboxItem.updateMany({ where: { id: inbox.id, userId: user.accountId, status: "NEW", expenseId: null }, data: { status: "PROCESSED", expenseId: expense.id } });
        if (claimed.count !== 1) throw new HttpError(409, "Het document is intussen gewijzigd. Vernieuw de inbox.");
      }
      await tx.auditLog.create({ data: { accountId: user.accountId, actorId: user.id, actorName: user.name || user.email || "gebruiker", action: "expense.created", target: expense.id } });
      return { ...expense, replayed: false };
    });

    return NextResponse.json(created, { status: created.replayed ? 200 : 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
