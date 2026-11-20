import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { depositSettlementLines, depositToSettle, quoteConvertCheck } from "@/lib/quote-invoice";
import { findCreditNoteFor } from "@/lib/invoice-credit";

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
        const found = await tx.invoice.findFirst({
          where: { id: current.depositInvoiceId, userId },
          select: { invoiceNumber: true, status: true, creditedAt: true, lineItems: { select: { vatRate: true, lineTotal: true } } },
        });
        // Alleen een uitgereikte, niet gecrediteerde aanbetaling wordt verrekend.
        // Een aanbetaling die nog concept is: eerst versturen of verwijderen, anders
        // betaalt de klant hem straks dubbel of juist niet.
        // Een concept-creditfactuur voor de aanbetaling telt nog niet mee, maar
        // maakt de verrekening onzeker: eerst uitreiken of verwijderen.
        const pendingCredit = found && depositToSettle(found) === "settle"
          ? await findCreditNoteFor(tx, userId, { id: current.depositInvoiceId, invoiceNumber: found.invoiceNumber }, "DRAFT")
          : null;
        const settle = depositToSettle(found, !!pendingCredit);
        if (settle === "draft") {
          throw new HttpError(409, `De aanbetalingsfactuur ${found!.invoiceNumber} is nog een concept. Verstuur of verwijder die eerst; daarna kun je de offerte omzetten.`);
        }
        if (settle === "credit_draft") {
          throw new HttpError(409, `Voor de aanbetalingsfactuur ${found!.invoiceNumber} staat een concept-creditfactuur (${pendingCredit}) klaar. Verstuur die creditfactuur of verwijder hem eerst; daarna kun je de offerte omzetten. Zo betaalt de klant de aanbetaling niet twee keer, en ook niet te weinig.`);
        }
        const deposit = settle === "settle" ? found! : null;
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
