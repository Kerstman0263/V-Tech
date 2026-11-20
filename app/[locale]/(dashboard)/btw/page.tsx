import { getTranslations, getLocale } from "next-intl/server";
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
import { fromCents, toCents } from "@/lib/money";
import { korYearStatus } from "@/lib/kor";

// BTW-aangifte-hulp: per kwartaal de bedragen die je bij de
// Belastingdienst invult — omzet, af te dragen BTW en voorbelasting.
export default async function VatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; y?: string }>;
}) {
  const t = await getTranslations("vat");
  const user = await requireUser();
  if (!can(user, "financials")) redirect(`/${await getLocale()}/dashboard`);
  const uid = user.accountId;

  const now = new Date();
  const params = await searchParams;
  const requestedYear = Number(params.y), requestedQuarter = Number(params.q);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : now.getFullYear();
  const quarter = Number.isInteger(requestedQuarter) && requestedQuarter >= 1 && requestedQuarter <= 4 ? requestedQuarter : Math.floor(now.getMonth() / 3) + 1;

  const qStart = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const qEnd = new Date(Date.UTC(year, quarter * 3, 1));

  const [invoices, expenses, dbUser, drafts, unmatched, pending, foreign, originals, settings] = await Promise.all([
    db.invoice.findMany({
      where: {
        userId: uid,
        issueDate: { gte: qStart, lt: qEnd },
        status: { notIn: ["DRAFT", "CANCELED"] },
        currency: "EUR",
      },
      select: { subtotal: true, vatAmount: true },
    }),
    db.expense.findMany({
      where: { userId: uid, date: { gte: qStart, lt: qEnd } },
      select: { id: true, amountGross: true, vatAmount: true },
    }),
    db.user.findUnique({ where: { id: uid }, select: { locale: true } }),
    db.invoice.count({ where: { userId: uid, issueDate: { gte: qStart, lt: qEnd }, status: "DRAFT" } }),
    db.bankTransaction.count({ where: { userId: uid, date: { gte: qStart, lt: qEnd }, status: "UNMATCHED" } }),
    db.inboxItem.count({ where: { userId: uid, status: "NEW" } }),
    db.invoice.count({ where: { userId: uid, issueDate: { gte: qStart, lt: qEnd }, status: { notIn: ["DRAFT", "CANCELED"] }, currency: { not: "EUR" } } }),
    db.inboxItem.findMany({ where: { userId: uid, status: "PROCESSED", expenseId: { not: null } }, select: { expenseId: true } }),
    db.invoiceSettings.findUnique({ where: { userId: uid }, select: { korEnabled: true } }),
  ]);

  const locale = dbUser?.locale ?? "nl";
  // KOR aan: hoe staat de omzet van dit jaar ten opzichte van de grens?
  const kor = settings?.korEnabled ? await korYearStatus(db, uid, year) : null;
  const revenueExcl = fromCents(invoices.reduce((s, i) => s + toCents(Number(i.subtotal)), 0));
  const vatOwed = fromCents(invoices.reduce((s, i) => s + toCents(Number(i.vatAmount)), 0));
  const costsGross = fromCents(expenses.reduce((s, e) => s + toCents(Number(e.amountGross)), 0));
  const inputVat = fromCents(expenses.reduce((s, e) => s + toCents(Number(e.vatAmount)), 0));
  const balance = fromCents(toCents(vatOwed) - toCents(inputVat));
  const missing = await db.expense.count({ where: { userId: uid, date: { gte: qStart, lt: qEnd }, receipt: null, id: { notIn: originals.flatMap((item) => item.expenseId ? [item.expenseId] : []) } } });
  const checks = [
    { key: "drafts", count: drafts, href: "/invoices" },
    { key: "unmatched", count: unmatched, href: "/bank" },
    { key: "pending", count: pending, href: "/expenses" },
    { key: "missing", count: missing, href: "/expenses" },
    { key: "foreign", count: foreign, href: "/invoices" },
  ];
  const signals = checks.reduce((sum, check) => sum + check.count, 0);

  const quarters = [1, 2, 3, 4] as const;
  const years = [year - 1, year, year + 1].filter((y) => y <= now.getFullYear());

  const rows = [
    { key: "revenue", value: revenueExcl, hint: t("revenueHint") },
    { key: "vatOwed", value: vatOwed, hint: t("vatOwedHint") },
    { key: "inputVat", value: inputVat, hint: t("inputVatHint", { count: expenses.length, costs: formatMoney(costsGross, locale) }) },
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

      <div data-testid="quarter-checks"><Card className="mb-5 overflow-hidden">
        <div className="border-b border-white/10 p-5"><h2 className="font-semibold text-white">{t("checks.title")}</h2><p className="mt-1 text-sm text-slate-400">{t(signals > 0 ? "checks.signals" : "checks.clear", { count: signals })}</p></div>
        <div className="divide-y divide-white/5">{checks.map((check) => <Link key={check.key} href={check.href} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-white/[0.03]" data-testid={`quarter-${check.key}`}>
          <div><p className="text-sm font-medium text-white">{t(`checks.${check.key}`)}</p><p className="mt-1 text-xs text-slate-400">{t(`checks.${check.key}Hint`)}</p></div>
          <span className={`shrink-0 rounded-lg px-3 py-1 text-sm font-semibold ${check.count ? "bg-amber-500/10 text-amber-300" : "bg-white/5 text-slate-300"}`}>{check.count} →</span>
        </Link>)}</div>
        {settings?.korEnabled && <p className="border-t border-white/10 p-5 text-sm text-amber-200">{t("checks.kor")}</p>}
        {kor && kor.level !== "ok" && <p role={kor.level === "over" ? "alert" : "status"} data-testid="vat-kor-threshold" className={kor.level === "over" ? "border-t border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200" : "border-t border-white/10 p-5 text-sm text-amber-200"}>{t(kor.level === "over" ? "checks.korOver" : "checks.korNear", { revenue: formatMoney(kor.revenue, locale), threshold: formatMoney(kor.threshold, locale), year: kor.year })}</p>}
      </Card></div>
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
