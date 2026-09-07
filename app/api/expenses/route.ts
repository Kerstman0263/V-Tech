import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { createExpenseSchema } from "@/lib/validations/expense";
import { logAccount } from "@/lib/audit";

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

    return NextResponse.json(
      expenses.map((e) => ({
        id: e.id,
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

    const created = await db.expense.create({
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
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "expense.created", `${d.vendor} — € ${d.amountGross.toFixed(2)}`);

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
