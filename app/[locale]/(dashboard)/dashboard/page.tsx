import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { cn, formatMoney, greetingKey } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/Card";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RadialGauge } from "@/components/dashboard/RadialGauge";
import { AgingBreakdown, type AgingBucket } from "@/components/dashboard/AgingBreakdown";
import { TopCustomers } from "@/components/dashboard/TopCustomers";
import { LiveClock } from "@/components/dashboard/LiveClock";
import { BedrijfDashboard, type MemberStats } from "@/components/dashboard/BedrijfDashboard";
import { Icon } from "@/components/ui/Icon";
import { can } from "@/lib/permissions";
import { trialDaysLeft } from "@/lib/subscription";

// Zachte achtergrondkleuren voor de team-avatarstack.
const AVATAR_COLORS = ["bg-brand-500", "bg-emerald-500", "bg-amber-500", "bg-sky-500", "bg-rose-500", "bg-fuchsia-500"];
function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

/** Procentueel verschil tussen twee periodes; null als er geen zinvolle
 *  vergelijkingsbasis is (vorige periode 0 → een percentage is misleidend). */
function delta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

const DAY = 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const ti = await getTranslations("invoices");
  const tq = await getTranslations("quotes");
  const tc = await getTranslations("common");
  const user = await requireUser();
  const uid = user.accountId;
  // Alleen de account-eigenaar (+ platformbeheerder) ziet financiële cijfers.
  // Medewerkers/leidinggevenden krijgen een persoonlijke werkweergave.
  const showFinancials = can(user, "financials");
  const canManage = can(user, "manageTeam");

  const [invoices, timeEntries, businessMileage, dbUser, recent, recentTime, recentMileage, me, quarterExpenses] =
    await Promise.all([
      db.invoice.findMany({
        where: { userId: uid },
        select: { status: true, subtotal: true, total: true, vatAmount: true, issueDate: true, dueDate: true, customer: { select: { name: true } } },
      }),
      db.timeEntry.findMany({ where: { userId: uid }, select: { hours: true, hourlyRate: true, status: true, date: true } }),
      db.mileageEntry.findMany({ where: { userId: uid, type: "BUSINESS" }, select: { distanceKm: true, ratePerKm: true, date: true } }),
      db.user.findUnique({ where: { id: uid }, select: { name: true, locale: true, company: { select: { name: true, accountType: true } } } }),
      db.invoice.findMany({
        where: { userId: uid },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.timeEntry.findMany({ where: { userId: uid }, orderBy: { date: "desc" }, take: 4, select: { id: true, date: true, hours: true, description: true } }),
      db.mileageEntry.findMany({ where: { userId: uid }, orderBy: { date: "desc" }, take: 4, select: { id: true, date: true, distanceKm: true, fromAddress: true, toAddress: true } }),
      // De ingelogde persoon (voor de persoonlijke begroeting) — kan een teamlid zijn
      db.user.findUnique({ where: { id: user.id }, select: { name: true } }),
      // Uitgaven van dit kwartaal → voorbelasting op de BTW-tegel.
      // Zowel begin- als eindgrens van het kwartaal, anders tellen toekomstige
      // uitgaven mee en wordt de af te dragen BTW te laag getoond.
      db.expense.findMany({
        where: {
          userId: uid,
          date: {
            gte: new Date(Date.UTC(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1)),
            lt: new Date(Date.UTC(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3 + 3, 1)),
          },
        },
        select: { vatAmount: true },
      }),
    ]);

  // Bedrijfsblok "Team vandaag" — alleen voor BEDRIJF-accounts
  const isBedrijf = dbUser?.company?.accountType === "BEDRIJF";
  const todayUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const [pendingLeave, absentLeave, openTasks, members] = isBedrijf
    ? await Promise.all([
        db.leaveRequest.count({ where: { userId: uid, status: "PENDING" } }),
        db.leaveRequest.findMany({
          where: { userId: uid, status: "APPROVED", startDate: { lte: todayUtc }, endDate: { gte: todayUtc } },
          select: { requesterId: true },
        }),
        db.task.count({ where: { userId: uid, status: { not: "DONE" } } }),
        db.user.findMany({ where: { ownerId: uid }, select: { id: true, name: true, email: true, hourlyCost: true } }),
      ])
    : [0, [], 0, []];
  const nameOf = (id: string) =>
    id === uid
      ? dbUser?.company?.name ?? dbUser?.name ?? "—"
      : members.find((m) => m.id === id)?.name ?? members.find((m) => m.id === id)?.email ?? "—";
  const absentNames = [...new Set(absentLeave.map((l) => nameOf(l.requesterId)))];
  // Team voor de avatarstack (eigenaar + medewerkers)
  const teamPeople: { id: string; name: string }[] = [
    { id: uid, name: dbUser?.company?.name ?? dbUser?.name ?? user.email ?? "—" },
    ...members.map((m) => ({ id: m.id, name: m.name ?? m.email ?? "—" })),
  ];

  const locale = dbUser?.locale ?? "nl";
  const openTime = timeEntries.filter((e) => e.status === "OPEN");
  // Omzet = excl. btw (subtotal), conform de btw-aangifte. Openstaand blijft
  // incl. btw (dat is wat de klant daadwerkelijk verschuldigd is).
  const paidTotal = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + Number(i.subtotal), 0);
  const openInvoices = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE");
  const openTotal = openInvoices.reduce((s, i) => s + Number(i.total), 0);
  const openHours = openTime.reduce((s, e) => s + Number(e.hours), 0);
  const openHoursValue = openTime.reduce((s, e) => s + Number(e.hours) * Number(e.hourlyRate ?? 0), 0);
  const businessKm = businessMileage.reduce((s, e) => s + Number(e.distanceKm), 0);
  const mileageDeduction = businessMileage.reduce((s, e) => s + Number(e.distanceKm) * Number(e.ratePerKm), 0);

  // --- Tijdreeksen: laatste 6 maanden ---------------------------------------
  const now = new Date();
  const fmtMonth = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", { month: "short" });
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: fmtMonth.format(d) };
  });
  const inMonth = (d: Date, mo: { y: number; m: number }) => d.getFullYear() === mo.y && d.getMonth() === mo.m;

  const revenueData = months.map((mo) => ({
    label: mo.label,
    value: invoices
      .filter((i) => i.status === "PAID" && inMonth(i.issueDate, mo))
      .reduce((s, i) => s + Number(i.subtotal), 0),
    // Gefactureerd = alles wat de deur uit is (concept/geannuleerd tellen niet mee).
    invoiced: invoices
      .filter((i) => i.status !== "DRAFT" && i.status !== "CANCELED" && inMonth(i.issueDate, mo))
      .reduce((s, i) => s + Number(i.subtotal), 0),
  }));

  const revenueSeries = revenueData.map((d) => d.value);
  const openSeries = months.map((mo) => openInvoices.filter((i) => inMonth(i.issueDate, mo)).reduce((s, i) => s + Number(i.total), 0));
  const hoursSeries = months.map((mo) => timeEntries.filter((e) => inMonth(e.date, mo)).reduce((s, e) => s + Number(e.hours), 0));
  const kmSeries = months.map((mo) => businessMileage.filter((e) => inMonth(e.date, mo)).reduce((s, e) => s + Number(e.distanceKm), 0));

  const last = <T,>(a: T[]) => a[a.length - 1];
  const prev = <T,>(a: T[]) => a[a.length - 2];
  const revenueDelta = delta(last(revenueSeries) ?? 0, prev(revenueSeries) ?? 0);
  const hoursDelta = delta(last(hoursSeries) ?? 0, prev(hoursSeries) ?? 0);
  const kmDelta = delta(last(kmSeries) ?? 0, prev(kmSeries) ?? 0);

  // --- Debiteuren: incassoratio + ouderdomsanalyse ---------------------------
  const collectionRate = paidTotal + openTotal > 0 ? (paidTotal / (paidTotal + openTotal)) * 100 : 0;

  const agingTotals = { current: 0, d30: 0, d60: 0, d60plus: 0 };
  const agingCounts = { current: 0, d30: 0, d60: 0, d60plus: 0 };
  for (const inv of openInvoices) {
    const due = inv.dueDate ?? inv.issueDate;
    const daysLate = Math.floor((now.getTime() - due.getTime()) / DAY);
    const key: AgingBucket["key"] = daysLate <= 0 ? "current" : daysLate <= 30 ? "d30" : daysLate <= 60 ? "d60" : "d60plus";
    agingTotals[key] += Number(inv.total);
    agingCounts[key] += 1;
  }
  const agingBuckets: AgingBucket[] = (["current", "d30", "d60", "d60plus"] as const).map((key) => ({
    key,
    label: t(`aging_${key}`),
    amount: agingTotals[key],
    count: agingCounts[key],
  }));

  // --- Top klanten op betaalde omzet ---------------------------------------
  const byCustomer = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "PAID") continue;
    byCustomer.set(inv.customer.name, (byCustomer.get(inv.customer.name) ?? 0) + Number(inv.total));
  }
  const topCustomers = [...byCustomer.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // --- BTW dit kwartaal -----------------------------------------------------
  const q = Math.floor(now.getMonth() / 3);
  const vatQuarter = invoices
    .filter(
      (i) =>
        i.issueDate.getFullYear() === now.getFullYear() &&
        Math.floor(i.issueDate.getMonth() / 3) === q &&
        i.status !== "DRAFT" &&
        i.status !== "CANCELED",
    )
    .reduce((s, i) => s + Number(i.vatAmount), 0);
  const quarterLabel = `Q${q + 1} ${now.getFullYear()}`;
  const inputVat = quarterExpenses.reduce((s, e) => s + Number(e.vatAmount), 0);
  const vatBalance = vatQuarter - inputVat;
  const vatInputShare = vatQuarter > 0 ? Math.min(100, (inputVat / vatQuarter) * 100) : 0;

  // Recente activiteit (uren + ritten samengevoegd)
  const activity = [
    ...recentTime.map((e) => ({ id: e.id, type: "time" as const, date: e.date, title: e.description, meta: `${Number(e.hours)} u` })),
    ...recentMileage.map((e) => ({ id: e.id, type: "mileage" as const, date: e.date, title: `${e.fromAddress} → ${e.toAddress}`, meta: `${Number(e.distanceKm)} km` })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  // --- Bedrijfspaneel: eigen dashboard (personeel-eerst) voor eigenaar/leidinggevende ---
  if (isBedrijf && canManage) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const in14 = new Date(now.getTime() + 14 * DAY);
    const [monthTime, monthMiles, openByAssignee, monthInvoices, upcoming, sub, pendingHours] = await Promise.all([
      db.timeEntry.findMany({ where: { userId: uid, date: { gte: monthStart } }, select: { createdById: true, hours: true, hourlyRate: true } }),
      db.mileageEntry.findMany({ where: { userId: uid, type: "BUSINESS", date: { gte: monthStart } }, select: { createdById: true, distanceKm: true } }),
      db.task.findMany({ where: { userId: uid, status: { not: "DONE" } }, select: { assignedToId: true } }),
      db.invoice.findMany({ where: { userId: uid, issueDate: { gte: monthStart } }, select: { createdById: true } }),
      db.leaveRequest.findMany({
        where: { userId: uid, status: "APPROVED", startDate: { lte: in14 }, endDate: { gte: todayUtc } },
        select: { requesterId: true, type: true, startDate: true, endDate: true },
        orderBy: { startDate: "asc" },
        take: 8,
      }),
      db.subscription.findUnique({ where: { userId: uid }, select: { plan: true, status: true, trialEndsAt: true } }),
      db.timeEntry.count({ where: { userId: uid, approval: "PENDING" } }),
    ]);
    const perMember: MemberStats[] = teamPeople.map((p) => ({
      id: p.id,
      name: p.name,
      hours: monthTime.filter((e) => e.createdById === p.id).reduce((s, e) => s + Number(e.hours), 0),
      km: monthMiles.filter((e) => e.createdById === p.id).reduce((s, e) => s + Number(e.distanceKm), 0),
      openTasks: openByAssignee.filter((tk) => tk.assignedToId === p.id).length,
      invoices: monthInvoices.filter((i) => i.createdById === p.id).length,
      revenue: monthTime.filter((e) => e.createdById === p.id).reduce((s, e) => s + Number(e.hours) * Number(e.hourlyRate ?? 0), 0),
      cost: (() => {
        const hc = members.find((m) => m.id === p.id)?.hourlyCost;
        if (hc === null || hc === undefined) return null;
        return monthTime.filter((e) => e.createdById === p.id).reduce((s, e) => s + Number(e.hours) * Number(hc), 0);
      })(),
    }));
    const trial = sub && sub.status === "TRIALING" ? trialDaysLeft(sub) : null;

    return (
      <BedrijfDashboard
        locale={locale}
        greeting={t(greetingKey(), { name: me?.name || dbUser?.company?.name || user.email || "" })}
        companyName={dbUser?.company?.name || user.email || ""}
        welcomeSub={t("bedrijf.welcomeSub")}
        team={teamPeople}
        absentNames={absentNames}
        pendingLeave={pendingLeave}
        pendingHours={pendingHours}
        openTasks={openTasks}
        perMember={perMember}
        upcomingLeave={upcoming.map((l) => ({ name: nameOf(l.requesterId), type: l.type, start: l.startDate, end: l.endDate }))}
        trialDaysLeft={trial}
        showFinancials={showFinancials}
        finance={{
          paidTotal,
          openTotal,
          openCount: openInvoices.length,
          collectionRate,
          vatBalance,
          quarterLabel,
          revenueSeries,
          revenueData,
          recent: recent.map((inv) => ({ id: inv.id, invoiceNumber: inv.invoiceNumber, customer: inv.customer.name, status: inv.status, total: Number(inv.total) })),
          hasInvoices: invoices.length > 0,
        }}
      />
    );
  }

  return (
    <div className="relative">
      {/* Sfeerlaag: driftende aurora, fijn puntraster en filmkorrel. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 right-[-10%] h-[28rem] w-[28rem] animate-aurora-a rounded-full bg-brand-500/20 blur-[110px]" />
        <div className="absolute bottom-[-15%] left-[-5%] h-[26rem] w-[26rem] animate-aurora-b rounded-full bg-fuchsia-500/10 blur-[120px]" />
        <div className="absolute left-1/3 top-1/4 h-72 w-72 animate-aurora-b rounded-full bg-teal-500/[0.07] blur-[100px]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.07) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="bg-grain absolute inset-0 opacity-[0.15] mix-blend-overlay" />
      </div>

      <div className="stagger relative flex flex-col gap-5">
        {/* Welkomstbanner — anker voor stap 1 van de productrondleiding */}
        <div
          id="tour-welcome"
          style={{ "--i": 0 } as React.CSSProperties}
          className="relative animate-rise overflow-hidden rounded-3xl border border-[#7c3aed]/25 bg-gradient-to-br from-[#241356] via-[#160f38] to-[#0d0a20] p-6 text-white shadow-2xl shadow-black/40 sm:p-8"
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
              backgroundSize: "34px 34px",
            }}
          />
          <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 animate-aurora-a rounded-full bg-brand-500/25 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 right-24 h-64 w-64 animate-aurora-b rounded-full bg-fuchsia-500/20 blur-3xl" />
          {/* Glans die één keer over de banner trekt */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
          />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-200">
                {t(greetingKey(), { name: me?.name || dbUser?.company?.name || user.email || "" })}
              </p>
              <h1 className="mt-1 bg-gradient-to-r from-white via-white to-brand-200 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                {dbUser?.company?.name || user.email}
              </h1>
              <p className="mt-2 max-w-lg text-sm text-slate-400">
                {isBedrijf && canManage ? t("welcomeSubManager") : t("welcomeSub")}
              </p>
            </div>
            <LiveClock locale={locale} />
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2">
            {isBedrijf && canManage ? (
              <>
                <Link href="/team" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md">
                  + {t("inviteMember")}
                </Link>
                <Link href="/tasks" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10">
                  + {t("assignTask")}
                </Link>
                {showFinancials && (
                  <Link href="/invoices/new" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10">
                    + {ti("new")}
                  </Link>
                )}
              </>
            ) : (
              <>
                {showFinancials && (
                  <>
                    <Link href="/invoices/new" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md">
                      + {ti("new")}
                    </Link>
                    <Link href="/quotes/new" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10">
                      + {tq("new")}
                    </Link>
                  </>
                )}
                <Link href="/time" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10">
                  {t("quickTime")}
                </Link>
                <Link href="/mileage" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10">
                  {t("quickMileage")}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Aan de slag — alleen bij een leeg/nieuw account (eigenaar) */}
        {showFinancials && invoices.length === 0 && <GettingStarted />}

        {/* Team vandaag — alleen voor eigenaar/leidinggevende van een bedrijf */}
        {isBedrijf && canManage && (
          <Card id="tour-team-today" style={{ "--i": 1 } as React.CSSProperties} className="animate-rise p-5">
            <h2 className="font-semibold text-white">{t("companyToday")}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name="sun" className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("companyAbsent")}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-white">{absentNames.length > 0 ? absentNames.join(", ") : t("companyNobody")}</p>
                </div>
              </div>
              <Link href="/verlof" className="group flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><Icon name="hourglass" className="h-4 w-4" /></span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("companyLeavePending")}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white group-hover:text-brand-300">{pendingLeave} <span className="font-normal text-slate-500">→</span></p>
                </div>
              </Link>
              <Link href="/tasks" className="group flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"><Icon name="check-circle" className="h-4 w-4" /></span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("companyOpenTasks")}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white group-hover:text-brand-300">{openTasks} <span className="font-normal text-slate-500">→</span></p>
                </div>
              </Link>
              <Link href="/team" className="group flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-400"><Icon name="users" className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("companyTeam")}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex -space-x-2 overflow-hidden">
                      {teamPeople.slice(0, 5).map((p, i) => (
                        <span
                          key={p.id}
                          title={p.name}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#12112a] text-xs font-medium text-white",
                            AVATAR_COLORS[i % AVATAR_COLORS.length],
                          )}
                        >
                          {initials(p.name)}
                        </span>
                      ))}
                      {teamPeople.length > 5 && (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#12112a] bg-white/10 text-xs font-medium text-slate-300">
                          +{teamPeople.length - 5}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-white group-hover:text-brand-300">{teamPeople.length}</span>
                  </div>
                </div>
              </Link>
            </div>
          </Card>
        )}

        {/* Financiële cijfers — alleen voor de account-eigenaar */}
        {showFinancials && (
          <>
            {/* KPI's met trendlijn en verschil t.o.v. vorige maand */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                index={2}
                label={t("kpiRevenue")}
                value={paidTotal}
                format="money"
                locale={locale}
                icon="euro"
                tone="green"
                href="/invoices"
                delta={revenueDelta}
                sub={revenueDelta === null ? t("kpiRevenueSub") : t("vsLastMonth")}
                series={revenueSeries}
              />
              <KpiCard
                index={3}
                label={t("kpiOpen")}
                value={openTotal}
                format="money"
                locale={locale}
                icon="send"
                tone="amber"
                href="/invoices"
                sub={t("kpiOpenSub", { count: openInvoices.length })}
                series={openSeries}
              />
              <KpiCard
                index={4}
                label={t("kpiHours")}
                value={openHours}
                format="hours"
                locale={locale}
                icon="clock"
                tone="teal"
                href="/time"
                delta={hoursDelta}
                sub={formatMoney(openHoursValue, locale)}
                series={hoursSeries}
              />
              <KpiCard
                index={5}
                label={t("kpiKm")}
                value={businessKm}
                format="km"
                locale={locale}
                icon="car"
                tone="brand"
                href="/mileage"
                delta={kmDelta}
                sub={`${formatMoney(mileageDeduction, locale)} ${t("kpiKmSub")}`}
                series={kmSeries}
              />
            </div>

            {/* Omzetgrafiek + incassoratio + BTW */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card style={{ "--i": 6 } as React.CSSProperties} className="animate-rise p-5 lg:col-span-2">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-white">{t("revenueTitle")}</h2>
                    <p className="text-xs text-slate-400">{t("revenueSub")}</p>
                  </div>
                  <Link href="/invoices" className="shrink-0 text-xs font-medium text-brand-400 hover:underline">
                    {t("viewAll")} →
                  </Link>
                </div>
                <RevenueChart
                  data={revenueData}
                  locale={locale}
                  emptyLabel={t("revenueEmpty")}
                  labels={{ paid: t("chartPaid"), invoiced: t("chartInvoiced"), average: t("chartAverage") }}
                />
              </Card>

              <div className="flex flex-col gap-4">
                {/* Incassoratio */}
                <Card style={{ "--i": 7 } as React.CSSProperties} className="animate-rise p-5">
                  <h2 className="font-semibold text-white">{t("collectionTitle")}</h2>
                  <div className="mt-3">
                    <RadialGauge
                      percent={collectionRate}
                      sub={t("collectionSub")}
                      label={t("collectionHint")}
                      tone={collectionRate >= 80 ? "green" : collectionRate >= 50 ? "brand" : "amber"}
                    />
                  </div>
                </Card>

                {/* BTW dit kwartaal */}
                <Card style={{ "--i": 8 } as React.CSSProperties} className="animate-rise flex flex-1 flex-col justify-between p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-400">{t("vatTitle")}</p>
                      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">{quarterLabel}</span>
                    </div>
                    <p className="tabular mt-2 text-3xl font-bold tracking-tight text-white">
                      {formatMoney(Math.max(0, vatBalance), locale)}
                    </p>
                    {/* Verhouding afdracht ↔ voorbelasting */}
                    {vatQuarter > 0 && (
                      <>
                        <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-amber-500/20">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${vatInputShare}%` }} />
                        </div>
                        {inputVat > 0 && (
                          <p className="mt-2 text-xs text-slate-400">
                            {t("vatBreakdown", { owed: formatMoney(vatQuarter, locale), input: formatMoney(inputVat, locale) })}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{t("vatSub")}</p>
                    <Link href="/btw" className="text-xs font-semibold text-brand-400 hover:underline">
                      {t("vatCta")} →
                    </Link>
                  </div>
                </Card>
              </div>
            </div>

            {/* Debiteuren, klanten en activiteit */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card style={{ "--i": 9 } as React.CSSProperties} className="animate-rise p-5">
                <div className="mb-4 flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-white">{t("agingTitle")}</h2>
                  <span className="text-xs text-slate-500">{t("agingSub")}</span>
                </div>
                <AgingBreakdown buckets={agingBuckets} total={openTotal} locale={locale} emptyLabel={t("agingEmpty")} />
              </Card>

              <Card style={{ "--i": 10 } as React.CSSProperties} className="animate-rise p-5">
                <div className="mb-4 flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-white">{t("topCustomersTitle")}</h2>
                  <Link href="/customers" className="text-xs font-medium text-brand-400 hover:underline">{t("viewAll")}</Link>
                </div>
                <TopCustomers customers={topCustomers} locale={locale} emptyLabel={t("topCustomersEmpty")} />
              </Card>

              <Card style={{ "--i": 11 } as React.CSSProperties} className="animate-rise p-5">
                <h2 className="mb-4 font-semibold text-white">{t("activityTitle")}</h2>
                {activity.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">{t("activityEmpty")}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {activity.map((a) => (
                      <li key={`${a.type}-${a.id}`} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300">
                          <Icon name={a.type === "time" ? "clock" : "car"} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-200">{a.title}</p>
                          <p className="tabular text-xs text-slate-500">{a.date.toISOString().slice(0, 10)} · {a.meta}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Recente facturen */}
            <Card style={{ "--i": 12 } as React.CSSProperties} className="animate-rise overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <h2 className="font-semibold text-white">{t("recentInvoices")}</h2>
                <Link href="/invoices" className="text-sm font-medium text-brand-400 hover:underline">{t("viewAll")}</Link>
              </div>
              {recent.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="receipt"
                    title={ti("empty")}
                    action={<Link href="/invoices/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ {ti("new")}</Link>}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-5 py-2.5 font-medium">{ti("number")}</th>
                        <th className="px-5 py-2.5 font-medium">{ti("customer")}</th>
                        <th className="px-5 py-2.5 font-medium">{tc("status")}</th>
                        <th className="px-5 py-2.5 text-right font-medium">{ti("total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((inv) => (
                        <tr key={inv.id} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]">
                          <td className="px-5 py-3 font-medium">
                            <Link href={`/invoices/${inv.id}`} className="text-brand-400 hover:underline">{inv.invoiceNumber}</Link>
                          </td>
                          <td className="px-5 py-3 text-slate-400">{inv.customer.name}</td>
                          <td className="px-5 py-3"><InvoiceStatusBadge status={inv.status} /></td>
                          <td className="tabular px-5 py-3 text-right font-medium text-white">{formatMoney(Number(inv.total), locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {/* Persoonlijke werkweergave — voor medewerkers/leidinggevenden zonder
            toegang tot de bedrijfsfinanciën. */}
        {!showFinancials && (
          <Card style={{ "--i": 2 } as React.CSSProperties} className="animate-rise p-6">
            <h2 className="font-semibold text-white">{t("myWorkTitle")}</h2>
            <p className="mt-1 text-sm text-slate-400">{t("myWorkSub")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Link href="/tasks" className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-4 transition-all hover:-translate-y-0.5 hover:border-brand-400/40 hover:bg-white/[0.03]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name="check-circle" className="h-5 w-5" /></span>
                <span className="font-semibold text-white">{t("myTasks")}</span>
              </Link>
              <Link href="/time" className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-4 transition-all hover:-translate-y-0.5 hover:border-teal-400/40 hover:bg-white/[0.03]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400"><Icon name="clock" className="h-5 w-5" /></span>
                <span className="font-semibold text-white">{t("myHours")}</span>
              </Link>
              <Link href="/verlof" className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-4 transition-all hover:-translate-y-0.5 hover:border-amber-400/40 hover:bg-white/[0.03]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><Icon name="sun" className="h-5 w-5" /></span>
                <span className="font-semibold text-white">{t("myLeave")}</span>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
