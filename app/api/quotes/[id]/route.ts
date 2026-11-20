import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateQuoteStatusSchema } from "@/lib/validations/quote";
import { quoteDeleteBlock, quoteStatusChangeBlock } from "@/lib/quote-retention";
import { logAccount } from "@/lib/audit";

// GET /api/quotes/:id — detail (eigen account)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const quote = await db.quote.findFirst({
      where: { id, userId: user.accountId },
      include: { customer: true, lineItems: { orderBy: { position: "asc" } } },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(quote);
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/quotes/:id — status wijzigen
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateQuoteStatusSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige status" }, { status: 422 });
    }
    const current = await db.quote.findFirst({
      where: { id, userId: user.accountId },
      select: { status: true, signatureName: true, acceptedAt: true, depositInvoiceId: true, convertedInvoiceId: true },
    });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Een ondertekende of omgezette offerte gaat niet terug naar concept: anders
    // zou hij daarna te verwijderen zijn, met handtekening en al.
    const blocked = quoteStatusChangeBlock(current, parsed.data.status);
    if (blocked) return NextResponse.json({ error: blocked.message, code: blocked.code }, { status: 409 });
    const result = await db.quote.updateMany({
      where: { id, userId: user.accountId, status: current.status },
      data: { status: parsed.data.status },
    });
    if (result.count === 0) return NextResponse.json({ error: "De offerte is net gewijzigd. Vernieuw de pagina." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/quotes/:id — alleen een concept dat nooit is verstuurd of
// ondertekend. Een verstuurde, ondertekende of omgezette offerte is een zakelijk
// stuk (bewaarplicht 7 jaar, art. 52 AWR) en blijft bewaard.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const quote = await db.quote.findFirst({
      where: { id, userId: user.accountId },
      select: { quoteNumber: true, status: true, signatureName: true, acceptedAt: true, depositInvoiceId: true, convertedInvoiceId: true },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const blocked = quoteDeleteBlock(quote);
    if (blocked) return NextResponse.json({ error: blocked.message, code: blocked.code }, { status: 409 });
    // Atomair: alleen verwijderen als hij op dit moment nog steeds een leeg concept is.
    const result = await db.quote.deleteMany({
      where: { id, userId: user.accountId, status: "DRAFT", signatureName: null, acceptedAt: null, depositInvoiceId: null, convertedInvoiceId: null },
    });
    if (result.count === 0) return NextResponse.json({ error: "Deze offerte is net gewijzigd en kan niet meer worden verwijderd. Vernieuw de pagina.", code: "quote_changed" }, { status: 409 });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "quote.deleted", quote.quoteNumber);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
