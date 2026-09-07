import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { quickQuoteSchema } from "@/lib/validations/quote";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { getOrCreateInvoiceSettings, formatInvoiceNumber } from "@/lib/invoice-settings";

// POST /api/quotes/quick — "3-Klikken Offerte": 3 velden → klaar om te delen.
// Vindt/maakt de klant op naam, maakt een offerte met één regel (21% BTW),
// zet 'm direct op SENT en geeft de publieke deellink-token terug.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;

    const parsed = quickQuoteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const { customerName, lineItems, vatRate = 21, validityDays = 14, notes } = parsed.data;

    // Klant op naam hergebruiken of aanmaken
    let customer = await db.customer.findFirst({ where: { userId, name: customerName } });
    if (!customer) {
      customer = await db.customer.create({ data: { userId, name: customerName } });
    }

    // Eén btw-tarief voor alle regels (de "snelle" belofte: geen gepuzzel per regel)
    const totals = calculateInvoiceTotals(lineItems.map((li) => ({ ...li, vatRate })));
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validityDays);
    const settings = await getOrCreateInvoiceSettings(userId);

    const quote = await db.$transaction(async (tx) => {
      const current = await tx.invoiceSettings.findUnique({ where: { userId } });
      const number = formatInvoiceNumber(current!.quotePrefix, current!.quoteNextNumber, current!.quotePadding);

      const created = await tx.quote.create({
        data: {
          userId,
          createdById: user.id,
          customerId: customer!.id,
          quoteNumber: number,
          publicToken: randomUUID(),
          status: "SENT", // direct klaar om te delen
          validUntil,
          notes: notes?.trim() || null,
          currency: settings.defaultCurrency,
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
        select: { id: true, quoteNumber: true, publicToken: true },
      });

      await tx.invoiceSettings.update({ where: { userId }, data: { quoteNextNumber: { increment: 1 } } });
      return created;
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
