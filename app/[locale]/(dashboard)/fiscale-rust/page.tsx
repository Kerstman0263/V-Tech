import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { FiscaleRust } from "@/components/fiscale-rust/FiscaleRust";
import { FISCAL_YEARS } from "@/lib/fiscal-rates";

/**
 * Belastingreservering — rechtsvorm-bewust:
 * - zzp / eenmanszaak / vof: btw + inkomstenbelasting + Zvw
 * - bv: btw + vennootschapsbelasting (geen Zvw), met DGA-loon als aandachtspunt
 */
export default async function FiscaleRustPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations("fiscaleRust");
  const { locale } = await params;
  const user = await requireUser();
  if (!can(user, "financials")) redirect(`/${locale}/dashboard`);

  const [company, settings] = await Promise.all([
    db.company.findUnique({ where: { userId: user.accountId }, select: { accountType: true, legalForm: true } }),
    db.invoiceSettings.findUnique({ where: { userId: user.accountId }, select: { korEnabled: true } }),
  ]);
  const mode = company?.legalForm === "BV" ? "vpb" : "ib";
  const records = await Promise.all(FISCAL_YEARS.map(async (year) => {
    const dates = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    const invoiceWhere = { userId: user.accountId, issueDate: dates, status: { in: ["SENT", "PAID", "OVERDUE"] as ("SENT" | "PAID" | "OVERDUE")[] } };
    const [invoices, expenses, excludedCurrency] = await Promise.all([
      db.invoice.aggregate({ where: { ...invoiceWhere, currency: "EUR" }, _sum: { total: true, vatAmount: true }, _count: true }),
      db.expense.aggregate({ where: { userId: user.accountId, date: dates }, _sum: { amountGross: true, vatAmount: true }, _count: true }),
      db.invoice.count({ where: { ...invoiceWhere, currency: { not: "EUR" } } }),
    ]);
    return { year, gross: Number(invoices._sum.total ?? 0), outputVat: Number(invoices._sum.vatAmount ?? 0),
      costs: Number(expenses._sum.amountGross ?? 0), inputVat: Number(expenses._sum.vatAmount ?? 0),
      invoices: invoices._count, expenses: expenses._count, excludedCurrency };
  }));

  return (
    <div>
      <PageHeader title={mode === "vpb" ? t("titleVpb") : t("title")} subtitle={mode === "vpb" ? t("subtitleVpb") : t("subtitle")} />
      <FiscaleRust locale={locale} kor={settings?.korEnabled ?? false} mode={mode} currentYear={new Date().getUTCFullYear()} records={records} />
    </div>
  );
}
