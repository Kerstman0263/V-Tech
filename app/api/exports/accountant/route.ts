import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { csvAmount, toCsv, type CsvValue } from "@/lib/csv-safe";
import { EXPORTED_INVOICE_STATUSES } from "@/lib/auditfile";

// GET /api/exports/accountant?year=YYYY — boekhouder-export: alle uitgereikte
// facturen en alle uitgaven van een jaar in één CSV (Excel-NL: BOM + puntkomma
// + komma-decimaal). Vervallen concepten (CANCELED) zijn nooit uitgereikt: die
// staan onderaan als "Vervallen nummer", zonder bedragen, zodat de boekhouder
// ziet waarom een nummer ontbreekt.
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    // Boekhouder-export valt onder "Bank & btw exporteren" (zie lib/permissions).
    assertCan(user, "exports");
    const uid = user.accountId;

    const now = new Date();
    const yearParam = Number(new URL(req.url).searchParams.get("year"));
    const year = Number.isInteger(yearParam) && yearParam > 2000 && yearParam <= 2100 ? yearParam : now.getFullYear();
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));

    const [invoices, canceled, expenses] = await Promise.all([
      db.invoice.findMany({
        where: { userId: uid, status: { in: [...EXPORTED_INVOICE_STATUSES] }, issueDate: { gte: from, lt: to } },
        select: {
          invoiceNumber: true, issueDate: true, subtotal: true, vatAmount: true, total: true, status: true, currency: true,
          customer: { select: { name: true } },
        },
        orderBy: { issueDate: "asc" },
      }),
      db.invoice.findMany({
        where: { userId: uid, status: "CANCELED", issueDate: { gte: from, lt: to } },
        select: { invoiceNumber: true, issueDate: true },
        orderBy: { invoiceNumber: "asc" },
      }),
      // Alleen de bedragen: de bonnetjes (base64) zijn hier niet nodig.
      db.expense.findMany({
        where: { userId: uid, date: { gte: from, lt: to } },
        select: { date: true, vendor: true, description: true, category: true, amountGross: true, vatAmount: true },
        orderBy: { date: "asc" },
      }),
    ]);

    const money = (n: number) => csvAmount(n.toFixed(2).replace(".", ","));
    const dateStr = (d: Date) => csvAmount(d.toISOString().slice(0, 10));

    type Row = { soort: string; datum: Date; ref: string; naam: string; netto: number; btw: number; bruto: number; status: string; valuta: string };
    const rows: Row[] = [
      ...invoices.map((i) => ({
        soort: "Factuur",
        datum: i.issueDate,
        ref: i.invoiceNumber,
        naam: i.customer.name,
        netto: Number(i.subtotal),
        btw: Number(i.vatAmount),
        bruto: Number(i.total),
        status: i.status,
        valuta: (i.currency || "EUR").toUpperCase(),
      })),
      ...expenses.map((e) => ({
        soort: "Uitgave",
        datum: e.date,
        ref: e.vendor,
        naam: e.description ?? e.category,
        netto: Number(e.amountGross) - Number(e.vatAmount),
        btw: Number(e.vatAmount),
        bruto: Number(e.amountGross),
        status: e.category,
        valuta: "EUR",
      })),
    ].sort((a, b) => a.datum.getTime() - b.datum.getTime());

    const header = ["Soort", "Datum", "Referentie", "Naam / omschrijving", "Netto", "Btw", "Bruto", "Status / categorie", "Valuta"];
    const body: CsvValue[][] = rows.map((r) => [
      r.soort, dateStr(r.datum), r.ref, r.naam, money(r.netto), money(r.btw), money(r.bruto), r.status, r.valuta,
    ]);
    const voided: CsvValue[][] = canceled.map((c) => [
      "Vervallen nummer", dateStr(c.issueDate), c.invoiceNumber, "Vervallen concept, nooit uitgereikt (geen omzet en geen btw)", "", "", "", "CANCELED", "",
    ]);

    return new Response(toCsv([header, ...body, ...voided]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="boekhouder-export-${year}.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
