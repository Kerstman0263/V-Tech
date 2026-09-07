import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import type { Report } from "@/lib/reports";

/** Presentatie van de jaarrapportage — server component, geen interactie nodig. */
export async function ReportsView({ report, years, locale }: { report: Report; years: number[]; locale: string }) {
  const t = await getTranslations("reports");
  const tc = await getTranslations("expenses.categories");
  const money = (n: number) => formatMoney(n, locale, "EUR");
  const monthName = (m: number) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(report.year, m - 1, 1));
  const maxMonth = Math.max(1, ...report.monthly.map((m) => Math.max(m.revenue, m.costs + m.depreciation)));
  const { totals, aging } = report;
  const positive = totals.result >= 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Jaarkeuze */}
      <div className="flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/reports?year=${y}`}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", y === report.year ? "bg-brand-600 text-white shadow-glow" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white")}
          >
            {y}
          </Link>
        ))}
        <span className="ml-auto text-xs text-slate-500">{t("basisNote")}</span>
      </div>

      {/* Winst & verlies */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("revenue")} value={money(totals.revenue)} icon="trend" tone="brand" sub={t("exclVat")} />
        <StatCard label={t("costs")} value={money(totals.costs + totals.depreciation)} icon="receipt" tone="amber" sub={t("costsSub", { dep: money(totals.depreciation) })} />
        <StatCard label={t("result")} value={money(totals.result)} icon={positive ? "check-circle" : "alert"} tone={positive ? "green" : "rose"} sub={totals.margin === null ? undefined : t("margin", { pct: totals.margin })} />
        <StatCard label={t("vatBalance")} value={money(totals.vatBalance)} icon="euro" tone="teal" sub={t("vatSub", { owed: money(totals.vatOwed), input: money(totals.vatInput) })} />
      </div>

      {/* Maandverloop */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-white">{t("monthlyTitle")}</h2>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-brand-600 to-brand-400" />{t("revenue")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-amber-600 to-amber-400" />{t("costs")}</span>
          </div>
        </div>
        <div className="mt-5 flex h-44 items-end gap-2">
          {report.monthly.map((m) => (
            <div key={m.month} className="group flex flex-1 flex-col items-center gap-1">
              <div className="flex h-36 w-full items-end justify-center gap-0.5">
                <div className="w-1/2 rounded-t bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${(m.revenue / maxMonth) * 100}%` }} title={money(m.revenue)} />
                <div className="w-1/2 rounded-t bg-gradient-to-t from-amber-600 to-amber-400" style={{ height: `${((m.costs + m.depreciation) / maxMonth) * 100}%` }} title={money(m.costs + m.depreciation)} />
              </div>
              <span className="text-[10px] text-slate-500">{monthName(m.month)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{t("month")}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t("revenue")}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t("costs")}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t("depreciation")}</th>
                <th className="py-1.5 text-right font-medium">{t("result")}</th>
              </tr>
            </thead>
            <tbody>
              {report.monthly.map((m) => (
                <tr key={m.month} className="border-t border-white/[0.04]">
                  <td className="py-1.5 pr-3 text-slate-300">{monthName(m.month)}</td>
                  <td className="tabular py-1.5 pr-3 text-right text-slate-300">{money(m.revenue)}</td>
                  <td className="tabular py-1.5 pr-3 text-right text-slate-300">{money(m.costs)}</td>
                  <td className="tabular py-1.5 pr-3 text-right text-slate-400">{money(m.depreciation)}</td>
                  <td className={cn("tabular py-1.5 text-right font-medium", m.result >= 0 ? "text-emerald-300" : "text-rose-300")}>{money(m.result)}</td>
                </tr>
              ))}
              <tr className="border-t border-white/10 font-semibold text-white">
                <td className="py-2 pr-3">{t("total")}</td>
                <td className="tabular py-2 pr-3 text-right">{money(totals.revenue)}</td>
                <td className="tabular py-2 pr-3 text-right">{money(totals.costs)}</td>
                <td className="tabular py-2 pr-3 text-right">{money(totals.depreciation)}</td>
                <td className={cn("tabular py-2 text-right", positive ? "text-emerald-300" : "text-rose-300")}>{money(totals.result)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Omzet per klant */}
        <Card className="p-5">
          <h2 className="font-semibold text-white">{t("byCustomerTitle")}</h2>
          {report.byCustomer.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("noData")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {report.byCustomer.map((c) => (
                <li key={c.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-200">{c.name}</span>
                    <span className="tabular ml-3 shrink-0 text-slate-400">
                      {money(c.revenue)} · {c.share}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400" style={{ width: `${Math.max(2, c.share)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Kosten per categorie */}
        <Card className="p-5">
          <h2 className="font-semibold text-white">{t("byCategoryTitle")}</h2>
          {report.byCategory.length === 0 && totals.depreciation === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("noData")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {report.byCategory.map((c) => (
                <li key={c.category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">{tc(c.category)}</span>
                    <span className="tabular ml-3 text-slate-400">
                      {money(c.net)} · {c.share}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400" style={{ width: `${Math.max(2, c.share)}%` }} />
                  </div>
                </li>
              ))}
              {totals.depreciation > 0 && (
                <li className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-sm">
                  <span className="text-slate-200">{t("depreciation")}</span>
                  <span className="tabular text-slate-400">{money(totals.depreciation)}</span>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {/* Ouderdom debiteuren */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-white">{t("agingTitle")}</h2>
          <span className="text-sm text-slate-400">
            {t("agingOpen", { count: aging.openCount })} · <span className="tabular font-semibold text-white">{money(aging.openTotal)}</span>
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["current", aging.current, "text-emerald-300"],
              ["d30", aging.d30, "text-amber-300"],
              ["d60", aging.d60, "text-orange-300"],
              ["d90", aging.d90, "text-rose-300"],
            ] as const
          ).map(([k, v, tone]) => (
            <div key={k} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t(`aging.${k}`)}</p>
              <p className={cn("tabular mt-1 text-lg font-bold", v > 0 ? tone : "text-slate-500")}>{money(v)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">{t("agingHint")}</p>
      </Card>
    </div>
  );
}
