import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { decrypt } from "@/lib/encryption";
import { auditfileNotes, buildJournal, buildXaf, EXPORTED_INVOICE_STATUSES, journalCsv, openingBalance, paidDateForExport } from "@/lib/auditfile";
import { logAccount } from "@/lib/audit";

/**
 * GET /api/exports/auditfile?year=YYYY&format=xaf|csv|check
 *  - xaf: XML Auditfile Financieel 3.2, voor import in een boekhoudpakket
 *         (Exact, SnelStart, e-Boekhouden, Twinfield, …).
 *  - csv: journaalposten (één regel per boekingsregel) voor "boekingen importeren".
 *  - check: JSON met wat er bewust niet in de export staat (vervallen nummers,
 *         facturen in een andere valuta), om vóór het downloaden te tonen.
 *
 * Alleen uitgereikte facturen (verzonden, te laat, betaald; ook creditfacturen).
 * Ontvangsten staan op de betaaldatum, ook bij een factuur uit een eerder jaar.
 * Zulke facturen staan in de XAF ook in de beginbalans (Debiteuren), zodat het
 * saldo van 1300 klopt.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "exports");
    const uid = user.accountId;
    const sp = new URL(req.url).searchParams;
    const yearParam = Number(sp.get("year"));
    const year = Number.isInteger(yearParam) && yearParam > 2000 && yearParam <= 2100 ? yearParam : new Date().getFullYear();
    const rawFormat = sp.get("format");
    const format = rawFormat === "csv" ? "csv" : rawFormat === "check" ? "check" : "xaf";
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    const issued = [...EXPORTED_INVOICE_STATUSES];

    const [company, invoices, canceled, expenses, customers] = await Promise.all([
      format === "xaf" ? db.company.findUnique({ where: { userId: uid } }) : Promise.resolve(null),
      db.invoice.findMany({
        where: {
          userId: uid,
          status: { in: issued },
          OR: [
            // Verkoopboeking: factuurdatum in dit jaar.
            { issueDate: { gte: from, lt: to } },
            // Factuur uit een eerder jaar die op 1 januari nog openstond: voor de
            // beginbalans, en bij een betaling in dit jaar ook voor de ontvangst.
            // Alleen op de vastgelegde betaaldatum (paidAt), nooit op updatedAt:
            // die schuift mee met elke wijziging (bijv. een latere creditfactuur
            // zet creditedAt) en zou dezelfde ontvangst dan in twee jaren boeken.
            // Betaald zonder paidAt telt als vóór dit jaar betaald; de SQL in
            // prisma/sql/2026-11-18-factuur-betaaldatum.sql vult paidAt bij oude facturen.
            {
              issueDate: { lt: from },
              OR: [{ status: { in: ["SENT", "OVERDUE"] } }, { status: "PAID", paidAt: { gte: from } }],
            },
          ],
        },
        select: {
          id: true, invoiceNumber: true, issueDate: true, status: true, subtotal: true, vatAmount: true, total: true,
          currency: true, vatScheme: true, paidAt: true, updatedAt: true,
          customer: { select: { id: true, name: true } },
          lineItems: { select: { lineTotal: true, vatRate: true } },
        },
        orderBy: { issueDate: "asc" },
      }),
      db.invoice.findMany({
        where: { userId: uid, status: "CANCELED", issueDate: { gte: from, lt: to } },
        select: { invoiceNumber: true, status: true, currency: true },
        orderBy: { invoiceNumber: "asc" },
      }),
      // Alleen de bedragen: de bonnetjes (base64) zijn hier niet nodig.
      format === "check"
        ? Promise.resolve([])
        : db.expense.findMany({
            where: { userId: uid, date: { gte: from, lt: to } },
            select: { id: true, date: true, vendor: true, description: true, category: true, amountGross: true, vatRate: true, vatAmount: true },
            orderBy: { date: "asc" },
          }),
      format === "xaf" ? db.customer.findMany({ where: { userId: uid }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    ]);

    const inYearInvoices = invoices.filter((i) => i.issueDate >= from && i.issueDate < to);
    const notes = auditfileNotes([...inYearInvoices, ...canceled]);
    if (format === "check") return NextResponse.json({ year, ...notes });

    // Betaalde facturen zonder betaaldatum (alleen van dit jaar, zie de query): de
    // datum van de gekoppelde bankontvangst.
    const withoutPaidAt = invoices.filter((i) => i.status === "PAID" && !i.paidAt).map((i) => i.id);
    const bankRows = withoutPaidAt.length
      ? await db.bankTransaction.findMany({
          where: { userId: uid, status: "MATCHED", matchedInvoiceId: { in: withoutPaidAt } },
          select: { matchedInvoiceId: true, date: true },
        })
      : [];
    const bankDate = new Map<string, Date>();
    for (const row of bankRows) {
      if (!row.matchedInvoiceId) continue;
      const known = bankDate.get(row.matchedInvoiceId);
      if (!known || row.date > known) bankDate.set(row.matchedInvoiceId, row.date);
    }

    const exportInvoices = invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      issueDate: i.issueDate,
      status: i.status,
      subtotal: Number(i.subtotal),
      vatAmount: Number(i.vatAmount),
      total: Number(i.total),
      currency: i.currency,
      vatScheme: i.vatScheme,
      customerId: i.customer.id,
      customerName: i.customer.name,
      paidAt: paidDateForExport(i, bankDate.get(i.id)),
      lines: i.lineItems.map((li) => ({ lineTotal: Number(li.lineTotal), vatRate: Number(li.vatRate) })),
    }));
    const entries = buildJournal(
      exportInvoices,
      expenses.map((e) => ({
        id: e.id,
        date: e.date,
        vendor: e.vendor,
        description: e.description,
        category: e.category,
        amountGross: Number(e.amountGross),
        vatRate: Number(e.vatRate),
        vatAmount: Number(e.vatAmount),
      })),
      year,
    );

    logAccount(uid, { id: user.id, name: user.name, email: user.email }, "export.auditfile", `${year} (${format})`);

    if (format === "csv") {
      return new Response(journalCsv(entries), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="journaalposten-${year}.csv"` },
      });
    }
    const xml = buildXaf(
      {
        name: company?.name ?? user.email ?? "Saldova",
        kvk: decrypt(company?.kvkNumber),
        vatNumber: decrypt(company?.vatNumber),
        street: decrypt(company?.address),
        postalCode: company?.postalCode,
        city: company?.city,
      },
      year,
      entries,
      customers,
      new Date(),
      openingBalance(exportInvoices, year),
    );
    return new Response(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="auditfile-${year}.xaf"` },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
