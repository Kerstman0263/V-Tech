import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { getTranslations } from "next-intl/server";

const CREDIT_LOCALES = ["nl", "en"] as const;

// POST /api/invoices/:id/credit — maakt een CREDITFACTUUR: een nieuwe factuur
// die de originele terugdraait (zelfde regels, maar NEGATIEVE bedragen), met een
// nieuw nummer en een verwijzing naar de originele factuur.
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
      // 1) Zoek op de verwijzingstekst die elke creditfactuur bovenaan krijgt.
      const byNote = await tx.invoice.findFirst({
        where: { userId, total: { lt: 0 }, status: { not: "CANCELED" }, OR: notesFor.map((note) => ({ notes: { startsWith: note } })) },
        select: { invoiceNumber: true },
      });
      // 2) Of via het logboek (als de tekst later is aangepast). Telt alleen als die
      //    creditfactuur nog bestaat en niet vervallen is.
      let existing = byNote?.invoiceNumber ?? null;
      if (!existing) {
        const logs = await tx.auditLog.findMany({
          where: { accountId: userId, action: "invoice.credited", target: { startsWith: `${current.invoiceNumber} → ` } },
          select: { target: true }, take: 20,
        });
        const numbers = logs.map((log) => log.target?.slice(current.invoiceNumber.length + 3) ?? "").filter(Boolean);
        if (numbers.length) {
          const live = await tx.invoice.findFirst({
            where: { userId, invoiceNumber: { in: numbers }, total: { lt: 0 }, status: { not: "CANCELED" } },
            select: { invoiceNumber: true },
          });
          existing = live?.invoiceNumber ?? null;
        }
      }
      if (existing) {
        throw new HttpError(409, `Voor factuur ${current.invoiceNumber} bestaat al een creditfactuur (${existing}).`);
      }

      const created = await createInvoiceInTransaction(tx, {
        accountId: userId, createdById: user.id, customerId: current.customerId,
        currency: current.currency, notes: [notesFor[ownLocale], current.notes].filter(Boolean).join("\n\n"),
        dueDate: null,
        lineItems: current.lineItems.map((li) => ({
          description: li.description, quantity: -Number(li.quantity),
          unitPrice: Number(li.unitPrice), vatRate: Number(li.vatRate),
        })),
      });
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
