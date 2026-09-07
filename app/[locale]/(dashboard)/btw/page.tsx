import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { AccountantExport } from "@/components/invoices/AccountantExport";
import { Icon } from "@/components/ui/Icon";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";

// BTW-aangifte-hulp: per kwartaal de bedragen die je bij de
// Belastingdienst invult — omzet, af te dragen BTW en voorbelasting.
export default async function VatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; y?: string }>;
}) {
  const t = await getTranslations("vat");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");
  const uid = user.accountId;

  const now = new Date();
  const params = await searchParams;
  const year = Number(params.y) || now.getFullYear();
  const quarter = Math.min(4, Math.max(1, Number(params.q) || Math.floor(now.getMonth() / 3) + 1));

  const qStart = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const qEnd = new Date(Date.UTC(year, quarter * 3, 1));

  const [invoices, expenses, dbUser] = await Promise.all([
    db.invoice.findMany({
      where: {
        userId: uid,
        issueDate: { gte: qStart, lt: qEnd },
        status: { notIn: ["DRAFT", "CANCELED"] },
      },
      select: { subtotal: true, vatAmount: true },
    }),
    db.expense.findMany({
      where: { userId: uid, date: { gte: qStart, lt: qEnd } },
      select: { amountGross: true, vatAmount: true },
    }),
    db.user.findUnique({ where: { id: uid }, select: { locale: true } }),
  ]);

  const locale = dbUser?.locale ?? "nl";
  const revenueExcl = invoices.reduce((s, i) => s + Number(i.subtotal), 0);
  const vatOwed = invoices.reduce((s, i) => s + Number(i.vatAmount), 0);
  const costsGross = expenses.reduce((s, e) => s + Number(e.amountGross), 0);
  const inputVat = expenses.reduce((s, e) => s + Number(e.vatAmount), 0);
  const balance = vatOwed - inputVat;

  const quarters = [1, 2, 3, 4] as const;
  const years = [year - 1, year, year + 1].filter((y) => y <= now.getFullYear());

  const rows = [
    { key: "revenue", box: "1a", value: revenueExcl, hint: t("revenueHint") },
    { key: "vatOwed", box: "1a", value: vatOwed, hint: t("vatOwedHint") },
    { key: "inputVat", box: "5b", value: inputVat, hint: t("inputVatHint", { count: expenses.length, costs: formatMoney(costsGross, locale) }) },
  ] as const;

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Kwartaal-selector */}
      <div data-tour="vat-quarter" className="mb-5 flex flex-wrap items-center gap-2">
        {years.map((y) =>
          quarters.map((q) => (
            <Link
              key={`${y}-${q}`}
              href={`/btw?y=${y}&q=${q}`}
              className={
                y === year && q === quarter
                  ? "rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10"
              }
            >
              Q{q} {y}
            </Link>
          )),
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Aangifteregels */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <h2 className="font-semibold text-white">{t("boxesTitle", { quarter: `Q${quarter} ${year}` })}</h2>
          </div>
          <div data-tour="vat-boxes" className="divide-y divide-white/[0.04]">
            {rows.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    <span className="mr-2 rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-bold text-brand-300">{r.box}</span>
                    {t(`rows.${r.key}`)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">{r.hint}</p>
                </div>
                <p className="text-lg font-bold tracking-tight text-white">{formatMoney(r.value, locale)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Saldo */}
        <Card className="flex flex-col justify-between p-5">
          <div data-tour="vat-balance">
            <p className="text-sm font-medium text-slate-400">{t("balanceTitle")}</p>
            <p className={`mt-2 text-3xl font-bold tracking-tight ${balance >= 0 ? "text-white" : "text-emerald-400"}`}>
              {formatMoney(Math.abs(balance), locale)}
            </p>
            <p className={`mt-1 text-sm font-medium ${balance >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {balance >= 0 ? t("toPay") : t("toReceive")}
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <Link href="/expenses" className="inline-flex items-center gap-1.5 font-medium text-brand-400 hover:underline">
              <Icon name="receipt" className="h-4 w-4" />
              {t("addExpensesCta")}
            </Link>
            <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">{t("disclaimer")}</p>
          </div>
        </Card>
      </div>

      {/* Boekhouder-export */}
      <div data-tour="vat-export" className="mt-4">
        <AccountantExport currentYear={year} />
      </div>
    </div>
  );
}
