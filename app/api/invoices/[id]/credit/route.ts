import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { getTranslations } from "next-intl/server";
import { parseVatScheme } from "@/lib/vat-scheme";
import { findCreditNoteFor } from "@/lib/invoice-credit";

const CREDIT_LOCALES = ["nl", "en"] as const;

// POST /api/invoices/:id/credit — maakt een CREDITFACTUUR: een nieuwe factuur
// die de originele terugdraait (zelfde regels, maar NEGATIEVE bedragen), met een
// nieuw nummer en een verwijzing naar de originele factuur. Het nummer en de
// datum van het origineel worden apart opgeslagen, zodat de PDF ze als vast
// onderdeel toont ("Creditfactuur voor factuur X van <datum>").
// Eén creditfactuur per factuur; niet voor concepten en niet voor creditfacturen.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;
    const { id } = await params;

    const original = await db.invoice.findFirst({
      where: { id, userId },
      select: { id: true, user: { select: { locale: true } } },
    });
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // De verwijzingstekst in elke taal waarin hij ooit gemaakt kan zijn (de taal
    // van het account kan sindsdien gewisseld zijn).
    const translators = await Promise.all(CREDIT_LOCALES.map((locale) => getTranslations({ locale, namespace: "invoices" })));
    const ownLocale = original.user.locale === "en" ? 1 : 0;

    await getOrCreateInvoiceSettings(userId);
    const credit = await serializableTransaction(async (tx) => {
      const current = await tx.invoice.findFirst({
        where: { id, userId },
        include: { lineItems: { orderBy: { position: "asc" } } },
      });
      if (!current) throw new HttpError(404, "Factuur niet gevonden.");
      if (current.status === "DRAFT") {
        throw new HttpError(409, "Een concept is nog niet uitgereikt. Pas het aan of verwijder het; een creditfactuur is niet nodig.");
      }
      if (current.status === "CANCELED") {
        throw new HttpError(409, "Deze factuur is vervallen. Een creditfactuur is niet nodig.");
      }
      if (Number(current.total) <= 0) {
        throw new HttpError(409, "Dit is al een creditfactuur (of een factuur zonder bedrag). Daarvan kun je geen creditfactuur maken.");
      }

      const notesFor = translators.map((t) => t("creditNote", { number: current.invoiceNumber }));
      // Al een creditfactuur (ook een concept) voor deze factuur? Zoek op de vaste
      // verwijzing, op de verwijzingstekst die elke (ook oudere) creditfactuur
      // bovenaan krijgt, of via het logboek (als de tekst later is aangepast).
      // Een vervallen creditfactuur telt niet; een logregel van een verwijderd
      // concept waarvan het nummer later is hergebruikt ook niet.
      const byNote = await tx.invoice.findFirst({
        where: { userId, total: { lt: 0 }, status: { not: "CANCELED" }, OR: notesFor.map((note) => ({ notes: { startsWith: note } })) },
        select: { invoiceNumber: true },
      });
      const existing = byNote?.invoiceNumber ?? (await findCreditNoteFor(tx, userId, current, { not: "CANCELED" }));
      if (existing) {
        throw new HttpError(409, `Voor factuur ${current.invoiceNumber} bestaat al een creditfactuur (${existing}).`);
      }

      const created = await createInvoiceInTransaction(tx, {
        accountId: userId, createdById: user.id, customerId: current.customerId,
        currency: current.currency, notes: [notesFor[ownLocale], current.notes].filter(Boolean).join("\n\n"),
        dueDate: null,
        // Zelfde levering of dienst als het origineel, en een vaste verwijzing ernaar.
        // Zonder leverdatum gold de factuurdatum van het origineel als leverdatum;
        // die neemt de creditfactuur over (niet haar eigen datum).
        deliveryDate: current.deliveryDate ?? current.issueDate, deliveryEndDate: current.deliveryEndDate,
        originalInvoice: { id: current.id, number: current.invoiceNumber, date: current.issueDate },
        // Zelfde btw-soort als het origineel (btw verlegd blijft verlegd).
        vatScheme: parseVatScheme(current.vatScheme),
        // Zelfde referentie van de klant: de klant boekt de credit dan op dezelfde order.
        buyerReference: current.buyerReference,
        lineItems: current.lineItems.map((li) => ({
          description: li.description, quantity: -Number(li.quantity),
          unitPrice: Number(li.unitPrice), vatRate: Number(li.vatRate),
        })),
      });
      // De creditfactuur is nu een concept. Het origineel staat pas niet meer open
      // als de creditfactuur wordt uitgereikt (verzonden of betaald): dan krijgt
      // het origineel creditedAt (lib/invoice-credit.ts markOriginalCredited).
      await tx.auditLog.create({ data: {
        accountId: userId, actorId: user.id, actorName: user.name ?? "Accountgebruiker",
        action: "invoice.credited", target: `${current.invoiceNumber} → ${created.invoiceNumber}`,
      } });
      return created;
    });

    return NextResponse.json({ id: credit.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
