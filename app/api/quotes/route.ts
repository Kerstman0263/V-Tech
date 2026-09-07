import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { createQuoteSchema } from "@/lib/validations/quote";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { getOrCreateInvoiceSettings, formatInvoiceNumber } from "@/lib/invoice-settings";

// GET /api/quotes — offertes van het account
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const quotes = await db.quote.findMany({
      where: { userId: user.accountId },
      include: {
        customer: { select: { name: true } },
        // Aantal regels dat de klant zelf toevoegde op de publieke pagina
        _count: { select: { lineItems: { where: { clientAdded: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(quotes);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/quotes — nieuwe offerte (incl. regels), eigen nummering
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;

    const parsed = createQuoteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const data = parsed.data;

    const customer = await db.customer.findFirst({ where: { id: data.customerId, userId } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const totals = calculateInvoiceTotals(data.lineItems);
    const settings = await getOrCreateInvoiceSettings(userId);

    const issueDate = data.issueDate ?? new Date();
    let validUntil = data.validUntil ?? null;
    if (!validUntil) {
      validUntil = new Date(issueDate);
      validUntil.setDate(validUntil.getDate() + 30); // standaard 30 dagen geldig
    }

    const quote = await db.$transaction(async (tx) => {
      const current = await tx.invoiceSettings.findUnique({ where: { userId } });
      const number = formatInvoiceNumber(current!.quotePrefix, current!.quoteNextNumber, current!.quotePadding);

      const created = await tx.quote.create({
        data: {
          userId,
          createdById: user.id,
          customerId: data.customerId,
          quoteNumber: number,
          publicToken: randomUUID(),
          issueDate,
          validUntil,
          currency: settings.defaultCurrency,
          notes: data.notes ?? settings.defaultNotes ?? null,
          depositPercent: data.depositPercent ?? 0,
          subtotal: totals.subtotal,
          vatAmount: totals.vatAmount,
          total: totals.total,
          lineItems: {
            create: totals.lineItems.map((li, i) => ({
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              vatRate: li.vatRate,
              lineTotal: li.lineTotal,
              position: i,
            })),
          },
        },
      });

      await tx.invoiceSettings.update({
        where: { userId },
        data: { quoteNextNumber: { increment: 1 } },
      });

      return created;
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
