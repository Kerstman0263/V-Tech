import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientEditQuoteSchema } from "@/lib/validations/quote";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// POST /api/public/quotes/:token/edit — publiek (geen login).
// De klant voegt eigen regels/wensen + een bericht toe en slaat dit op.
// Verandert NIET de officiële offertebedragen; het zijn aanvullingen die de
// ondernemer beoordeelt.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const limited = rateLimitResponse(`quote-edit:${token}:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = clientEditQuoteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const quote = await db.quote.findUnique({ where: { publicToken: token }, select: { id: true, status: true, validUntil: true } });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verlopen? Dan automatisch op EXPIRED zetten en niets meer toestaan.
  if ((quote.status === "SENT" || quote.status === "DRAFT") && quote.validUntil && quote.validUntil < new Date()) {
    await db.quote.update({ where: { id: quote.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "expired", status: "EXPIRED" }, { status: 409 });
  }
  if (quote.status !== "SENT" && quote.status !== "DRAFT") {
    return NextResponse.json({ error: "already_handled", status: quote.status }, { status: 409 });
  }

  const items = parsed.data.lineItems ?? [];

  await db.$transaction(async (tx) => {
    // Eerdere klant-aanvullingen vervangen
    await tx.quoteLineItem.deleteMany({ where: { quoteId: quote.id, clientAdded: true } });
    if (items.length > 0) {
      await tx.quoteLineItem.createMany({
        data: items.map((li, i) => ({
          quoteId: quote.id,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          vatRate: 21,
          lineTotal: round2(li.quantity * li.unitPrice),
          position: 1000 + i,
          clientAdded: true,
        })),
      });
    }
    await tx.quote.update({
      where: { id: quote.id },
      data: { clientNote: parsed.data.note?.trim() || null },
    });
  });

  return NextResponse.json({ ok: true });
}
