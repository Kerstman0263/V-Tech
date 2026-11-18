import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { TodayActions } from "@/components/dashboard/TodayActions";
import type { TodayAction } from "@/lib/today-actions";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { GettingStarted } from "@/components/dashboard/GettingStarted";

const AVATAR_COLORS = ["bg-brand-500", "bg-emerald-500", "bg-amber-500", "bg-sky-500", "bg-rose-500", "bg-fuchsia-500"];
const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export interface MemberStats {
  id: string;
  name: string;
  hours: number;
  km: number;
  openTasks: number;
  invoices: number;
  /** Uren x gefactureerd tarief (deze maand) */
  revenue: number;
  /** Uren x bruto uurloon; null als geen uurloon bekend */
  cost: number | null;
}

export interface BedrijfDashboardProps {
  locale: string;
  greeting: string;
  companyName: string;
  welcomeSub: string;
  dateLabel: string;
  team: { id: string; name: string }[];
  absentNames: string[];
  pendingLeave: number;
  /** Urenregistraties van medewerkers die op goedkeuring wachten. */
  pendingHours: number;
  openTasks: number;
  perMember: MemberStats[];
  upcomingLeave: { name: string; type: string; start: Date; end: Date }[];
  trialDaysLeft: number | null;
  showFinancials: boolean;
  /** "Vandaag doen" — alleen gevuld voor wie de financiën beheert. */
  todayActions?: TodayAction[];
  finance: {
    paidTotal: number;
    openTotal: number;
    openCount: number;
    collectionRate: number;
    vatBalance: number;
    quarterLabel: string;
    revenueSeries: number[];
    revenueData: { label: string; value: number; invoiced: number }[];
    recent: { id: string; invoiceNumber: string; customer: string; status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELED"; total: number }[];
    hasInvoices: boolean;
  };
}

/**
 * Het bedrijfspaneel-dashboard: personeel-eerst. Team vandaag, wie doet wat
 * deze maand, verlof dat eraan komt — en daaronder de financiën compact.
 * Eigen accent (teal via data-panel="bedrijf") zodat je meteen ziet dat dit
 * het bedrijfsproduct is, geen zzp-scherm met extra blokjes.
 */
export async function BedrijfDashboard(p: BedrijfDashboardProps) {
  const t = await getTranslations("dashboard");
  const tb = await getTranslations("dashboard.bedrijf");
  const ti = await getTranslations("invoices");
  const tl = await getTranslations("leave");
  const money = (n: number) => formatMoney(n, p.locale);
  const fmtDate = (d: Date) => new Intl.DateTimeFormat(p.locale, { day: "numeric", month: "short" }).format(d);

  const attention: { label: string; value: string; href: string; icon: IconName; hot: boolean }[] = [
    { label: tb("absentToday"), value: p.absentNames.length > 0 ? p.absentNames.join(", ") : t("companyNobody"), href: "/verlof", icon: "sun", hot: false },
    { label: tb("leaveToReview"), value: String(p.pendingLeave), href: "/verlof", icon: "hourglass", hot: p.pendingLeave > 0 },
    { label: tb("hoursToReview"), value: String(p.pendingHours), href: "/time", icon: "clock", hot: p.pendingHours > 0 },
    { label: tb("openTasks"), value: String(p.openTasks), href: "/tasks", icon: "check-circle", hot: false },
  ];
  const needsAction = p.pendingLeave + p.pendingHours > 0;

  return (
    <div className="relative">
      <div className="stagger relative flex flex-col gap-6">
        {/* Proefperiode-balk */}
        {p.trialDaysLeft !== null && (
          <div style={{ "--i": 0 } as React.CSSProperties} className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-5 py-3">
            <p className="text-sm text-brand-100">
              <Icon name="hourglass" className="mr-2 inline h-4 w-4 align-[-3px] text-brand-300" />
              {p.trialDaysLeft > 0 ? tb("trialBanner", { days: p.trialDaysLeft }) : tb("trialLastDay")}
            </p>
            <Link href="/settings" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:bg-brand-500">
              {tb("trialCta")}
            </Link>
          </div>
        )}

        {/* Kop */}
        <div id="tour-welcome" style={{ "--i": 1 } as React.CSSProperties} className="animate-rise flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium capitalize text-brand-300">{p.dateLabel}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{p.companyName}</h1>
            <p className="mt-1 text-sm text-slate-400">{p.greeting}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/team" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all hover:bg-brand-500 hover:shadow-glow-md">+ {t("inviteMember")}</Link>
            <Link href="/tasks" className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-white/10">+ {t("assignTask")}</Link>
            {p.showFinancials && (
              <Link href="/invoices/new" className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-white/10">+ {ti("new")}</Link>
            )}
          </div>
        </div>

        {/* Vraagt je aandacht */}
        <Card id="tour-team-today" style={{ "--i": 2 } as React.CSSProperties} className="animate-rise p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-white">{tb("attention")}</h2>
            {!needsAction && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">{tb("attentionAllGood")}</span>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {attention.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={cn(
                  "group rounded-xl border p-4 transition-all hover:-translate-y-0.5",
                  a.hot ? "border-amber-400/40 bg-amber-500/10" : "border-white/[0.06] bg-white/[0.02] hover:border-brand-400/30",
                )}
              >
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", a.hot ? "bg-amber-500/20 text-amber-300" : "bg-brand-500/10 text-brand-300")}>
                  <Icon name={a.icon} className="h-4 w-4" />
                </span>
                <p className="mt-3 text-xs font-medium text-slate-400">{a.label}</p>
                <p className={cn("mt-0.5 font-bold", a.value.length > 4 ? "line-clamp-2 text-sm" : "text-2xl", a.hot ? "text-amber-200" : "text-white")}>{a.value}</p>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.05] pt-4">
            <div className="flex -space-x-2 overflow-hidden">
              {p.team.slice(0, 6).map((m, i) => (
                <span key={m.id} title={m.name} className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 border-kaart text-[10px] font-semibold text-white", AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                  {initials(m.name)}
                </span>
              ))}
            </div>
            <Link href="/team" className="text-xs font-medium text-slate-400 hover:text-white">{t("companyTeam")}: {p.team.length} →</Link>
          </div>
        </Card>

        {/* Aan de slag — leeg team */}
        <GettingStarted />

        {/* Wie doet wat deze maand + verlof komende 14 dagen */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card style={{ "--i": 3 } as React.CSSProperties} className="animate-rise overflow-hidden lg:col-span-2">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <h2 className="font-semibold text-white">{tb("teamMonthTitle")}</h2>
              <Link href="/team" className="text-sm font-medium text-brand-400 hover:underline">{t("viewAll")}</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">{tb("colMember")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{tb("colHours")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{tb("colKm")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{tb("colTasks")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{tb("colInvoices")}</th>
                    {p.showFinancials && <th className="px-5 py-2.5 text-right font-medium">{tb("colMargin")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {p.perMember.map((m, i) => (
                    <tr key={m.id} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2">
                          <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white", AVATAR_COLORS[i % AVATAR_COLORS.length])}>{initials(m.name)}</span>
                          <span className="font-medium text-white">{m.name}</span>
                        </span>
                      </td>
                      <td className="tabular px-5 py-3 text-right text-slate-300">{m.hours.toLocaleString(p.locale, { maximumFractionDigits: 1 })} u</td>
                      <td className="tabular px-5 py-3 text-right text-slate-300">{Math.round(m.km)} km</td>
                      <td className="tabular px-5 py-3 text-right text-slate-300">{m.openTasks}</td>
                      <td className="tabular px-5 py-3 text-right text-slate-300">{m.invoices}</td>
                      {p.showFinancials && (
                        <td className={cn("tabular px-5 py-3 text-right font-semibold", m.cost === null ? "text-slate-500" : m.revenue - m.cost >= 0 ? "text-emerald-300" : "text-rose-300")} title={m.cost === null ? tb("marginNoCost") : `${tb("colRevenue")} ${money(m.revenue)} · ${tb("colCost")} ${money(m.cost)}`}>
                          {m.cost === null ? "—" : `${money(m.revenue - m.cost)}${m.revenue > 0 ? ` (${Math.round(((m.revenue - m.cost) / m.revenue) * 100)}%)` : ""}`}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ "--i": 4 } as React.CSSProperties} className="animate-rise p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold text-white">{tb("upcomingLeaveTitle")}</h2>
              <Link href="/verlof" className="text-xs font-medium text-brand-400 hover:underline">{t("viewAll")}</Link>
            </div>
            {p.upcomingLeave.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">{tb("upcomingLeaveEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {p.upcomingLeave.map((l, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300"><Icon name="sun" className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{l.name}</p>
                      <p className="text-xs text-slate-500">{tl(`type${l.type}`)} · {fmtDate(l.start)}{l.end.getTime() !== l.start.getTime() ? ` – ${fmtDate(l.end)}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Financiën compact — alleen eigenaar/boekhouder */}
        {p.showFinancials && (
          <>
            <h2 className="-mb-2 mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{tb("financeTitle")}</h2>
            <Card style={{ "--i": 5 } as React.CSSProperties} className="animate-rise grid grid-cols-2 p-0 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.06]">
              {[
                { label: t("kpiRevenue"), value: money(p.finance.paidTotal), sub: t("kpiRevenueSub"), href: "/invoices" },
                { label: t("kpiOpen"), value: money(p.finance.openTotal), sub: t("kpiOpenSub", { count: p.finance.openCount }), href: "/invoices" },
                { label: `${t("vatTitle")} · ${p.finance.quarterLabel}`, value: money(Math.max(0, p.finance.vatBalance)), sub: t("vatCta"), href: "/btw" },
                { label: tb("collection"), value: `${Math.round(p.finance.collectionRate)}%`, sub: tb("collectionSub"), href: "/reports" },
              ].map((k) => (
                <Link key={k.label} href={k.href} className="p-5 transition-colors hover:bg-white/[0.02]">
                  <p className="truncate text-xs font-medium text-slate-400 sm:text-sm">{k.label}</p>
                  <p className="tabular mt-1.5 truncate text-xl font-bold tracking-tight text-white sm:text-2xl">{k.value}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{k.sub}</p>
                </Link>
              ))}
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card style={{ "--i": 9 } as React.CSSProperties} className="animate-rise p-5 lg:col-span-2">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-white">{t("revenueTitle")}</h2>
                    <p className="text-xs text-slate-400">{t("revenueSub")}</p>
                  </div>
                  <Link href="/reports" className="shrink-0 text-xs font-medium text-brand-400 hover:underline">{tb("toReports")} →</Link>
                </div>
                <RevenueChart data={p.finance.revenueData} locale={p.locale} emptyLabel={t("revenueEmpty")} labels={{ paid: t("chartPaid"), invoiced: t("chartInvoiced"), average: t("chartAverage") }} />
              </Card>
              <Card style={{ "--i": 10 } as React.CSSProperties} className="animate-rise overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                  <h2 className="font-semibold text-white">{t("recentInvoices")}</h2>
                  <Link href="/invoices" className="text-sm font-medium text-brand-400 hover:underline">{t("viewAll")}</Link>
                </div>
                {p.finance.recent.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-500">{ti("empty")}</p>
                ) : (
                  <ul className="divide-y divide-white/[0.04]">
                    {p.finance.recent.map((inv) => (
                      <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <Link href={`/invoices/${inv.id}`} className="text-sm font-medium text-brand-400 hover:underline">{inv.invoiceNumber}</Link>
                          <p className="truncate text-xs text-slate-500">{inv.customer}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <InvoiceStatusBadge status={inv.status} />
                          <span className="tabular text-sm font-medium text-white">{money(inv.total)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}

        {p.showFinancials && p.finance.hasInvoices && p.todayActions && p.todayActions.length > 0 && <TodayActions actions={p.todayActions} />}
      </div>
    </div>
  );
}
