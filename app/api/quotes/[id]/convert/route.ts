import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { depositSettlementLines, quoteConvertCheck } from "@/lib/quote-invoice";

// POST /api/quotes/:id/convert — zet een geaccepteerde offerte om in een factuur.
// Een verzonden (nog niet geaccepteerde) offerte alleen met body { confirm: true }.
// Regels die de klant zelf toevoegde komen niet mee; een al gefactureerde
// aanbetaling wordt per btw-tarief verrekend.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;
    const { id } = await params;
    const body: unknown = await req.json().catch(() => ({}));
    const confirmed = typeof body === "object" && body !== null && (body as { confirm?: unknown }).confirm === true;

    const quote = await db.quote.findFirst({ where: { id, userId }, select: { id: true, status: true, convertedInvoiceId: true } });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (quote.convertedInvoiceId) {
      return NextResponse.json({ invoiceId: quote.convertedInvoiceId, already: true });
    }
    const check = quoteConvertCheck(quote.status, confirmed);
    if (!check.ok) return NextResponse.json({ error: check.error, code: check.code, status: quote.status }, { status: check.status });

    await getOrCreateInvoiceSettings(userId);

    const invoice = await serializableTransaction(async (tx) => {
      const current = await tx.quote.findFirst({
        where: { id: quote.id, userId },
        include: { lineItems: { where: { clientAdded: false }, orderBy: { position: "asc" } } },
      });
      if (!current) throw new HttpError(404, "Offerte niet gevonden.");
      if (current.convertedInvoiceId) return { id: current.convertedInvoiceId };
      const recheck = quoteConvertCheck(current.status, confirmed);
      if (!recheck.ok) throw new HttpError(recheck.status, recheck.error);
      if (current.lineItems.length === 0) throw new HttpError(422, "Deze offerte heeft geen regels om te factureren.");

      const lines = current.lineItems.map((li) => ({
        description: li.description,
        quantity: Number(li.quantity), unitPrice: Number(li.unitPrice), vatRate: Number(li.vatRate),
      }));
      let notes = current.notes;
      if (current.depositInvoiceId) {
        const deposit = await tx.invoice.findFirst({
          where: { id: current.depositInvoiceId, userId, status: { not: "CANCELED" } },
          select: { invoiceNumber: true, lineItems: { select: { vatRate: true, lineTotal: true } } },
        });
        if (deposit) {
          lines.push(...depositSettlementLines(deposit));
          notes = [notes, `De aanbetaling (factuur ${deposit.invoiceNumber}) is verrekend.`].filter(Boolean).join("\n\n");
        }
      }

      const created = await createInvoiceInTransaction(tx, {
        accountId: userId, createdById: user.id, customerId: current.customerId,
        currency: current.currency, notes, lineItems: lines,
      });
      const claimed = await tx.quote.updateMany({
        where: { id: quote.id, userId, convertedInvoiceId: null },
        data: { status: "CONVERTED", convertedInvoiceId: created.id },
      });
      if (claimed.count !== 1) throw new HttpError(409, "Deze offerte is net al omgezet. Vernieuw de pagina.");
      return created;
    });

    return NextResponse.json({ invoiceId: invoice.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
