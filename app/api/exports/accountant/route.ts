import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";

// GET /api/exports/accountant?year=YYYY — boekhouder-export: alle facturen en
// uitgaven van een jaar in één CSV (Excel-NL: BOM + puntkomma + komma-decimaal).
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const uid = user.accountId;

    const now = new Date();
    const yearParam = Number(new URL(req.url).searchParams.get("year"));
    const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : now.getFullYear();
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));

    const [invoices, expenses] = await Promise.all([
      db.invoice.findMany({
        where: { userId: uid, status: { not: "DRAFT" }, issueDate: { gte: from, lt: to } },
        include: { customer: { select: { name: true } } },
        orderBy: { issueDate: "asc" },
      }),
      db.expense.findMany({
        where: { userId: uid, date: { gte: from, lt: to } },
        orderBy: { date: "asc" },
      }),
    ]);

    const money = (n: number) => n.toFixed(2).replace(".", ",");
    const dateStr = (d: Date) => d.toISOString().slice(0, 10);

    type Row = { soort: string; datum: Date; ref: string; naam: string; netto: number; btw: number; bruto: number; status: string };
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
      })),
    ].sort((a, b) => a.datum.getTime() - b.datum.getTime());

    const header = ["Soort", "Datum", "Referentie", "Naam / omschrijving", "Netto", "Btw", "Bruto", "Status / categorie"];
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      header.map(cell).join(";"),
      ...rows.map((r) =>
        [r.soort, dateStr(r.datum), r.ref, r.naam, money(r.netto), money(r.btw), money(r.bruto), r.status].map((v) => cell(String(v))).join(";"),
      ),
    ];

    const csv = "﻿" + lines.join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="boekhouder-export-${year}.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
