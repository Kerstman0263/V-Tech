import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RevenueChart, type RevenuePoint } from "@/components/dashboard/RevenueChart";
import { TodayActions } from "@/components/dashboard/TodayActions";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import type { TodayAction } from "@/lib/today-actions";

/** Urencriterium voor de zelfstandigenaftrek. */
const HOURS_TARGET = 1225;

export interface ZzpDashboardProps {
  locale: string;
  greeting: string;
  companyName: string;
  dateLabel: string;
  todayActions: TodayAction[];
  hasInvoices: boolean;
  paidYear: number;
  paidMonth: number;
  openTotal: number;
  openCount: number;
  overdueTotal: number;
  overdueCount: number;
  vatBalance: number;
  quarterLabel: string;
  unbilledHours: number;
  unbilledValue: number;
  hoursYear: number;
  kmYear: number;
  kmDeductionYear: number;
  revenueData: RevenuePoint[];
  openList: { id: string; number: string; customer: string; total: number; daysLate: number }[];
  activity: { id: string; type: "time" | "mileage"; date: Date; title: string; meta: string }[];
}

/**
 * Het zzp-paneel: rustig en overzichtelijk. Bovenaan wat je nú doet (snelle
 * acties), dan drie getallen die ertoe doen (binnen, nog te ontvangen, opzij
 * voor btw), en daarna pas de details. Geen dashboards vol meters.
 */
export async function ZzpDashboard(p: ZzpDashboardProps) {
  const t = await getTranslations("dashboard");
  const tz = await getTranslations("dashboard.zzp");
  const money = (n: number) => formatMoney(n, p.locale);
  const hoursPct = Math.min(100, (p.hoursYear / HOURS_TARGET) * 100);
  const hoursLeft = Math.max(0, HOURS_TARGET - p.hoursYear);
  const now = new Date();
  const weeksLeft = Math.max(1, Math.ceil((Date.UTC(now.getFullYear(), 11, 31) - now.getTime()) / (7 * 86_400_000)));
  const perWeek = hoursLeft / weeksLeft;

  const quick: { href: string; icon: IconName; title: string; sub: string; primary?: boolean }[] = [
    { href: "/invoices/new", icon: "invoice", title: tz("qInvoice"), sub: tz("qInvoiceSub"), primary: true },
    { href: "/time", icon: "clock", title: tz("qTime"), sub: tz("qTimeSub") },
    { href: "/mileage", icon: "car", title: tz("qMileage"), sub: tz("qMileageSub") },
    { href: "/expenses", icon: "receipt", title: tz("qExpense"), sub: tz("qExpenseSub") },
  ];

  return (
    <div className="relative">
      <div className="stagger relative flex flex-col gap-6">
        {/* Kop: begroeting + datum, rustig en klein */}
        <div id="tour-welcome" style={{ "--i": 0 } as React.CSSProperties} className="animate-rise flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium capitalize text-brand-300">{p.dateLabel}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{p.greeting}</h1>
            <p className="mt-1 text-sm text-slate-400">{tz("subtitle")}</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">{p.companyName}</span>
        </div>

        {/* Snel doen: de vier dingen die een zzp'er elke week doet */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quick.map((q, i) => (
            <Link
              key={q.href}
              href={q.href}
              style={{ "--i": i + 1 } as React.CSSProperties}
              className={cn(
                "group animate-rise flex flex-col items-start gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center transition-all duration-200 hover:-translate-y-0.5",
                q.primary
                  ? "border-brand-400/40 bg-brand-600 text-white shadow-glow hover:bg-brand-500 hover:shadow-glow-md"
                  : "border-white/[0.07] bg-white/[0.03] hover:border-brand-400/40 hover:bg-white/[0.05]",
              )}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", q.primary ? "bg-white/15 text-white" : "bg-brand-500/10 text-brand-300")}>
                <Icon name={q.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">{q.title}</span>
                <span className={cn("block text-xs", q.primary ? "text-white/75" : "text-slate-500")}>{q.sub}</span>
              </span>
            </Link>
          ))}
        </div>

        {!p.hasInvoices && <GettingStarted />}

        {/* De drie getallen die ertoe doen */}
        <Card style={{ "--i": 5 } as React.CSSProperties} className="animate-rise grid divide-y divide-white/[0.06] p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link href="/invoices" className="group p-5 transition-colors hover:bg-white/[0.02]">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> {tz("paidYear")}
            </p>
            <p className="tabular mt-2 text-3xl font-bold tracking-tight text-white">{money(p.paidYear)}</p>
            <p className="mt-1 text-xs text-slate-500">{tz("paidMonth", { amount: money(p.paidMonth) })}</p>
          </Link>
          <Link href="/invoices" className="group p-5 transition-colors hover:bg-white/[0.02]">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-400">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> {tz("open")}
            </p>
            <p className="tabular mt-2 text-3xl font-bold tracking-tight text-white">{money(p.openTotal)}</p>
            <p className={cn("mt-1 text-xs", p.overdueCount > 0 ? "font-medium text-rose-300" : "text-slate-500")}>
              {p.overdueCount > 0 ? tz("overdue", { count: p.overdueCount, amount: money(p.overdueTotal) }) : tz("openCount", { count: p.openCount })}
            </p>
          </Link>
          <Link href="/btw" className="group p-5 transition-colors hover:bg-white/[0.02]">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-400">
              <span className="h-2 w-2 rounded-full bg-brand-400" /> {tz("vat", { quarter: p.quarterLabel })}
            </p>
            <p className="tabular mt-2 text-3xl font-bold tracking-tight text-white">{money(Math.max(0, p.vatBalance))}</p>
            <p className="mt-1 text-xs text-slate-500">{tz("vatSub")}</p>
          </Link>
        </Card>

        {/* Vandaag doen */}
        {p.hasInvoices && p.todayActions.length > 0 && <TodayActions actions={p.todayActions} />}

        {/* Omzet + urencriterium */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card style={{ "--i": 6 } as React.CSSProperties} className="animate-rise p-5 lg:col-span-2">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-white">{t("revenueTitle")}</h2>
                <p className="text-xs text-slate-400">{t("revenueSub")}</p>
              </div>
              <Link href="/reports" className="shrink-0 text-xs font-medium text-brand-400 hover:underline">{t("viewAll")} →</Link>
            </div>
            <RevenueChart
              data={p.revenueData}
              locale={p.locale}
              emptyLabel={t("revenueEmpty")}
              labels={{ paid: t("chartPaid"), invoiced: t("chartInvoiced"), average: t("chartAverage") }}
            />
          </Card>

          <div className="flex flex-col gap-4">
            <Card style={{ "--i": 7 } as React.CSSProperties} className="animate-rise p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">{tz("hoursTitle")}</h2>
                <Link href="/time" className="text-xs font-medium text-brand-400 hover:underline">{tz("toHours")}</Link>
              </div>
              <p className="tabular mt-3 text-3xl font-bold tracking-tight text-white">
                {Math.round(p.hoursYear).toLocaleString(p.locale)}
                <span className="ml-1 text-base font-medium text-slate-500">/ {HOURS_TARGET.toLocaleString(p.locale)} u</span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400" style={{ width: `${hoursPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {hoursLeft === 0 ? tz("hoursDone") : tz("hoursLeft", { hours: Math.ceil(hoursLeft), perWeek: perWeek.toLocaleString(p.locale, { maximumFractionDigits: 1 }) })}
              </p>
            </Card>

            <Card style={{ "--i": 8 } as React.CSSProperties} className="animate-rise grid grid-cols-2 divide-x divide-white/[0.06] p-0">
              <Link href="/time" className="p-4 transition-colors hover:bg-white/[0.02]">
                <p className="text-xs font-medium text-slate-400">{tz("unbilled")}</p>
                <p className="tabular mt-1 text-lg font-bold text-white">{p.unbilledHours.toLocaleString(p.locale, { maximumFractionDigits: 1 })} u</p>
                <p className="tabular text-xs text-slate-500">{money(p.unbilledValue)}</p>
              </Link>
              <Link href="/mileage" className="p-4 transition-colors hover:bg-white/[0.02]">
                <p className="text-xs font-medium text-slate-400">{tz("kmYear")}</p>
                <p className="tabular mt-1 text-lg font-bold text-white">{Math.round(p.kmYear).toLocaleString(p.locale)} km</p>
                <p className="tabular text-xs text-slate-500">{tz("kmDeduction", { amount: money(p.kmDeductionYear) })}</p>
              </Link>
            </Card>
          </div>
        </div>

        {/* Nog te ontvangen + recent gewerkt */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card style={{ "--i": 9 } as React.CSSProperties} className="animate-rise overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <h2 className="font-semibold text-white">{tz("openTitle")}</h2>
              <Link href="/invoices" className="text-xs font-medium text-brand-400 hover:underline">{t("viewAll")}</Link>
            </div>
            {p.openList.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">{tz("openEmpty")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {p.openList.map((inv) => (
                  <li key={inv.id}>
                    <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">{inv.customer}</span>
                        <span className="block text-xs text-slate-500">{inv.number}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", inv.daysLate > 0 ? "bg-rose-500/15 text-rose-300" : "bg-white/[0.06] text-slate-400")}>
                          {inv.daysLate > 0 ? tz("daysLate", { days: inv.daysLate }) : tz("notDue")}
                        </span>
                        <span className="tabular text-sm font-semibold text-white">{money(inv.total)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card style={{ "--i": 10 } as React.CSSProperties} className="animate-rise overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <h2 className="font-semibold text-white">{tz("recentWork")}</h2>
              <Link href="/time" className="text-xs font-medium text-brand-400 hover:underline">{t("viewAll")}</Link>
            </div>
            {p.activity.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">{t("activityEmpty")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {p.activity.map((a) => (
                  <li key={`${a.type}-${a.id}`} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300">
                      <Icon name={a.type === "time" ? "clock" : "car"} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{a.title}</span>
                    <span className="tabular shrink-0 text-xs text-slate-500">
                      {new Intl.DateTimeFormat(p.locale, { day: "numeric", month: "short" }).format(a.date)} · {a.meta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
