import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, greetingKey } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/Card";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { BedrijfDashboard, type MemberStats } from "@/components/dashboard/BedrijfDashboard";
import { ZzpDashboard } from "@/components/dashboard/ZzpDashboard";
import { WebshopDashboard } from "@/components/dashboard/WebshopDashboard";
import { panelFor } from "@/lib/panel";
import { Icon } from "@/components/ui/Icon";
import { can } from "@/lib/permissions";
import { trialDaysLeft } from "@/lib/subscription";
import { computeTodayActions } from "@/lib/today-actions";
import { extractIban } from "@/lib/iban";
import { korYearStatus } from "@/lib/kor";
import { isOpenReceivable } from "@/lib/invoice-credit";


const DAY = 24 * 60 * 60 * 1000;

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations("dashboard");
  // Sessie ophalen zonder te gooien: een anoniem bezoek (verlopen sessie, bot)
  // gaat netjes naar de inlogpagina in plaats van een "Unauthorized"-fout in de log.
  const session = await auth();
  if (!session?.user?.id) redirect(`/${(await params).locale}/login`);
  const user = session.user;
  const uid = user.accountId;
  // Alleen de account-eigenaar (+ platformbeheerder) ziet financiële cijfers.
  // Medewerkers/leidinggevenden krijgen een persoonlijke werkweergave.
  const showFinancials = can(user, "financials");
  const canManage = can(user, "manageTeam");

  const [invoices, timeEntries, businessMileage, dbUser, recent, recentTime, recentMileage, me, quarterExpenses] =
    await Promise.all([
      db.invoice.findMany({
        where: { userId: uid },
        select: { id: true, invoiceNumber: true, status: true, subtotal: true, total: true, vatAmount: true, issueDate: true, dueDate: true, creditedAt: true, customer: { select: { name: true } } },
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
  const subPlan = (await db.subscription.findUnique({ where: { userId: uid }, select: { plan: true } }))?.plan ?? "FREE";
  const panel = panelFor(isBedrijf ? "BEDRIJF" : "ZZP", subPlan);
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
  // Gecrediteerde facturen en creditfacturen staan niet open (lib/invoice-credit.ts).
  const openInvoices = invoices.filter(isOpenReceivable);
  const openTotal = openInvoices.reduce((s, i) => s + Number(i.total), 0);
  const openHours = openTime.reduce((s, e) => s + Number(e.hours), 0);
  const openHoursValue = openTime.reduce((s, e) => s + Number(e.hours) * Number(e.hourlyRate ?? 0), 0);

  // "Vandaag doen" — alleen voor wie de financiën beheert.
  const todayActions = showFinancials
    ? await (async () => {
        const nowDate = new Date();
        const [expiringQuotes, settings, company] = await Promise.all([
          db.quote.count({ where: { userId: uid, status: "SENT", validUntil: { gte: nowDate, lte: new Date(nowDate.getTime() + 7 * DAY) } } }),
          db.invoiceSettings.findUnique({ where: { userId: uid }, select: { paymentTerms: true, korEnabled: true } }),
          db.company.findUnique({ where: { userId: uid }, select: { name: true, address: true, kvkNumber: true } }),
        ]);
        const late = invoices.filter((i) => isOpenReceivable(i) && (i.status === "OVERDUE" || (i.dueDate && i.dueDate < nowDate)));
        // KOR aan: waarschuwen zodra de jaaromzet de grens nadert of passeert.
        const korThreshold = settings?.korEnabled ? await korYearStatus(db, uid, nowDate.getUTCFullYear()) : null;
        return computeTodayActions({
          now: nowDate,
          lateInvoices: { count: late.length, total: late.reduce((s, i) => s + Number(i.total), 0) },
          draftInvoices: invoices.filter((i) => i.status === "DRAFT").length,
          unbilledHours: openHours,
          unbilledHoursValue: openHoursValue,
          expiringQuotes,
          hasAnyInvoice: invoices.length > 0,
          hasIban: !!extractIban(settings?.paymentTerms),
          hasCompanyDetails: !!(company?.name && company.address && company.kvkNumber),
          korThreshold,
          money: (n) => formatMoney(n, locale),
          date: (d) => d.toLocaleDateString(locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", timeZone: "UTC" }),
        });
      })()
    : [];

  const now = new Date();
  const greeting = t(greetingKey(), { name: me?.name || dbUser?.company?.name || user.email || "" });
  const dateLabel = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(now);

  // --- Webshoppaneel: eigen dashboard rond de winkel ---
  if (panel === "webshop" && showFinancials) {
    return <WebshopDashboard uid={uid} locale={locale} greeting={greeting} dateLabel={dateLabel} todayActions={todayActions} />;
  }

  // --- Tijdreeksen: laatste 6 maanden ---------------------------------------
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


  // --- Incassoratio (bedrijfspaneel) ---
  const collectionRate = paidTotal + openTotal > 0 ? (paidTotal / (paidTotal + openTotal)) * 100 : 0;

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
        dateLabel={dateLabel}
        team={teamPeople}
        absentNames={absentNames}
        pendingLeave={pendingLeave}
        pendingHours={pendingHours}
        openTasks={openTasks}
        perMember={perMember}
        upcomingLeave={upcoming.map((l) => ({ name: nameOf(l.requesterId), type: l.type, start: l.startDate, end: l.endDate }))}
        trialDaysLeft={trial}
        showFinancials={showFinancials}
        todayActions={todayActions}
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

  // Medewerker zonder toegang tot de financiën: persoonlijke werkweergave.
  if (!showFinancials) {
    return (
      <div className="flex flex-col gap-6">
        <div id="tour-welcome" className="animate-rise">
          <p className="text-sm font-medium capitalize text-brand-300">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{greeting}</h1>
        </div>
        <Card className="animate-rise p-6">
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
      </div>
    );
  }

  // --- Zzp-paneel ---
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const thisMonth = { y: now.getFullYear(), m: now.getMonth() };
  const paidInvoices = invoices.filter((i) => i.status === "PAID");
  const overdue = openInvoices.filter((i) => (i.dueDate ?? i.issueDate) < now);
  const yearMiles = businessMileage.filter((e) => e.date >= yearStart);
  return (
    <ZzpDashboard
      locale={locale}
      greeting={greeting}
      companyName={dbUser?.company?.name || user.email || ""}
      dateLabel={dateLabel}
      todayActions={todayActions}
      hasInvoices={invoices.length > 0}
      paidYear={paidInvoices.filter((i) => i.issueDate >= yearStart).reduce((s, i) => s + Number(i.subtotal), 0)}
      paidMonth={paidInvoices.filter((i) => inMonth(i.issueDate, thisMonth)).reduce((s, i) => s + Number(i.subtotal), 0)}
      openTotal={openTotal}
      openCount={openInvoices.length}
      overdueTotal={overdue.reduce((s, i) => s + Number(i.total), 0)}
      overdueCount={overdue.length}
      vatBalance={vatBalance}
      quarterLabel={quarterLabel}
      unbilledHours={openHours}
      unbilledValue={openHoursValue}
      hoursYear={timeEntries.filter((e) => e.date >= yearStart).reduce((s, e) => s + Number(e.hours), 0)}
      kmYear={yearMiles.reduce((s, e) => s + Number(e.distanceKm), 0)}
      kmDeductionYear={yearMiles.reduce((s, e) => s + Number(e.distanceKm) * Number(e.ratePerKm), 0)}
      revenueData={revenueData}
      openList={[...openInvoices]
        .sort((a, b) => (a.dueDate ?? a.issueDate).getTime() - (b.dueDate ?? b.issueDate).getTime())
        .slice(0, 5)
        .map((i) => ({
          id: i.id,
          number: i.invoiceNumber,
          customer: i.customer.name,
          total: Number(i.total),
          daysLate: Math.max(0, Math.floor((now.getTime() - (i.dueDate ?? i.issueDate).getTime()) / DAY)),
        }))}
      activity={activity}
    />
  );
}
