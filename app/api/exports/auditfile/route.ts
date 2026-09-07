import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { decrypt } from "@/lib/encryption";
import { buildJournal, buildXaf, journalCsv } from "@/lib/auditfile";
import { logAccount } from "@/lib/audit";

/**
 * GET /api/exports/auditfile?year=YYYY&format=xaf|csv
 *  - xaf: XML Auditfile Financieel 3.2 (Belastingdienst-standaard) — direct te
 *         importeren in Exact, SnelStart, e-Boekhouden, Twinfield, ….
 *  - csv: journaalposten (één regel per boekingsregel) voor "boekingen importeren".
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "exports");
    const uid = user.accountId;
    const sp = new URL(req.url).searchParams;
    const yearParam = Number(sp.get("year"));
    const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : new Date().getFullYear();
    const format = sp.get("format") === "csv" ? "csv" : "xaf";
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));

    const [company, invoices, expenses, customers] = await Promise.all([
      db.company.findUnique({ where: { userId: uid } }),
      db.invoice.findMany({
        where: { userId: uid, status: { not: "DRAFT" }, issueDate: { gte: from, lt: to } },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { issueDate: "asc" },
      }),
      db.expense.findMany({ where: { userId: uid, date: { gte: from, lt: to } }, orderBy: { date: "asc" } }),
      db.customer.findMany({ where: { userId: uid }, select: { id: true, name: true, email: true } }),
    ]);

    const entries = buildJournal(
      invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        issueDate: i.issueDate,
        status: i.status,
        subtotal: Number(i.subtotal),
        vatAmount: Number(i.vatAmount),
        total: Number(i.total),
        customerId: i.customer.id,
        customerName: i.customer.name,
        // Geen aparte betaaldatum in het model: het moment waarop de factuur op "betaald" ging
        paidAt: i.status === "PAID" ? i.updatedAt : null,
      })),
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
    );
    return new Response(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="auditfile-${year}.xaf"` },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
