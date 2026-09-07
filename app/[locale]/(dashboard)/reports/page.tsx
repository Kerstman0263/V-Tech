import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { buildReport } from "@/lib/reports";
import { depreciationByMonth } from "@/lib/depreciation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportsView } from "@/components/reports/ReportsView";

/**
 * Rapportages: winst & verlies (factuurbasis, excl. btw), omzet per klant,
 * kosten per categorie, maandverloop en ouderdom van openstaande facturen.
 * Server-side berekend uit facturen, uitgaven en afschrijvingen.
 */
export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const t = await getTranslations("reports");
  const { locale } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  const thisYear = new Date().getFullYear();
  const raw = Number(sp.year);
  const year = Number.isInteger(raw) && raw >= 2000 && raw <= thisYear + 1 ? raw : thisYear;

  const [invoices, expenses, assets, years] = await Promise.all([
    db.invoice.findMany({
      where: { userId: user.accountId },
      select: { issueDate: true, dueDate: true, status: true, subtotal: true, vatAmount: true, total: true, customer: { select: { name: true } } },
    }),
    db.expense.findMany({
      where: { userId: user.accountId, date: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
      select: { date: true, amountGross: true, vatAmount: true, category: true },
    }),
    db.asset.findMany({ where: { userId: user.accountId }, select: { purchaseDate: true, purchasePrice: true, residualValue: true, usefulLifeMonths: true, disposedAt: true } }),
    db.invoice.findMany({ where: { userId: user.accountId }, select: { issueDate: true }, orderBy: { issueDate: "asc" }, take: 1 }),
  ]);

  const firstYear = years[0] ? years[0].issueDate.getFullYear() : thisYear;
  const availableYears: number[] = [];
  for (let y = thisYear; y >= Math.min(firstYear, thisYear - 1); y--) availableYears.push(y);

  const report = buildReport(
    year,
    invoices.map((i) => ({
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      status: i.status,
      subtotal: Number(i.subtotal),
      vatAmount: Number(i.vatAmount),
      total: Number(i.total),
      customerName: i.customer.name,
    })),
    expenses.map((e) => ({ date: e.date, amountGross: Number(e.amountGross), vatAmount: Number(e.vatAmount), category: e.category })),
    depreciationByMonth(
      assets.map((a) => ({ purchaseDate: a.purchaseDate, purchasePrice: Number(a.purchasePrice), residualValue: Number(a.residualValue), usefulLifeMonths: a.usefulLifeMonths, disposedAt: a.disposedAt })),
      year,
    ),
  );

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ReportsView report={report} years={availableYears} locale={locale} />
    </div>
  );
}
