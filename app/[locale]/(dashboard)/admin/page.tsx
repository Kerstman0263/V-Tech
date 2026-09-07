import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { UsersTable } from "@/components/admin/UsersTable";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { AdminInsights, type WeekPoint } from "@/components/admin/AdminInsights";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import type { Plan } from "@prisma/client";

export default async function AdminPage() {
  const t = await getTranslations("admin");
  const locale = await getLocale();
  const viewer = await requireAdmin();

  const [users, openSupport, newMessages, pendingReviews, invoices, quotes, customers, timeEntries, bankTx, expenses] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        company: { select: { name: true, accountType: true } },
        role: true,
        createdAt: true,
        ownerId: true,
        subscription: { select: { plan: true, status: true } },
        _count: { select: { invoices: true, customers: true } },
      },
    }),
    db.supportThread.count({ where: { status: "OPEN" } }),
    db.contactMessage.count({ where: { handled: false } }),
    db.review.count({ where: { approved: false } }),
    db.invoice.count(),
    db.quote.count(),
    db.customer.count(),
    db.timeEntry.count(),
    db.bankTransaction.count(),
    db.expense.count(),
  ]);

  const owners = users.filter((u) => !u.ownerId);
  const paying = owners.filter((u) => u.subscription && u.subscription.plan !== "FREE").length;

  // MRR: som van de maandprijzen van alle betaalde plannen (eigenaren).
  const mrr = owners.reduce((sum, u) => {
    const plan = u.subscription?.plan ?? "FREE";
    return sum + (plan === "FREE" ? 0 : PLANS[plan].price);
  }, 0);
  const planCounts = Object.fromEntries(PLAN_ORDER.map((p) => [p, 0])) as Record<Plan, number>;
  for (const u of owners) planCounts[u.subscription?.plan ?? "FREE"] += 1;

  // Nieuwe accounts per week, laatste 8 weken (week = ma t/m zo).
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const fmtWeek = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const weeks: WeekPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    weeks.push({
      label: fmtWeek.format(start),
      count: users.filter((u) => u.createdAt >= start && u.createdAt < end).length,
    });
  }

  const fmtDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const recent = users.slice(0, 5).map((u) => ({
    id: u.id,
    name: u.company?.name ?? u.name ?? u.email,
    accountType: u.company?.accountType ?? "ZZP",
    email: u.email,
    plan: u.subscription?.plan ?? null,
    isMember: !!u.ownerId,
    createdAt: fmtDate.format(u.createdAt),
  }));

  const activity = [
    { key: "invoices", icon: "receipt" as const, value: invoices },
    { key: "quotes", icon: "send" as const, value: quotes },
    { key: "customers", icon: "users" as const, value: customers },
    { key: "time", icon: "clock" as const, value: timeEntries },
    { key: "bank", icon: "wallet" as const, value: bankTx },
    { key: "expenses", icon: "folder" as const, value: expenses },
  ];

  const serialized = users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <div className="flex gap-2">
            <Link href="/admin/support" className="relative rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
              <Icon name="chat" className="mr-1 inline h-4 w-4 align-[-2px]" />{t("support")}
              {openSupport > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">{openSupport}</span>}
            </Link>
            <Link href="/admin/messages" className="relative rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
              <Icon name="inbox" className="mr-1 inline h-4 w-4 align-[-2px]" />{t("messages")}
              {newMessages > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">{newMessages}</span>}
            </Link>
            <Link href="/admin/reviews" className="relative rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
              <Icon name="star" className="mr-1 inline h-4 w-4 align-[-2px]" />{t("reviews")}
              {pendingReviews > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">{pendingReviews}</span>}
            </Link>
            <Link href="/admin/logs" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
              <Icon name="search" className="mr-1 inline h-4 w-4 align-[-2px]" />{t("logs")}
            </Link>
          </div>
        }
      />

      {/* KPI's */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("kpiUsers")} value={String(users.length)} icon="users" tone="brand" sub={`${owners.length} ${t("kpiOwners")}`} />
        <StatCard label={t("kpiPaying")} value={String(paying)} icon="wallet" tone="green" sub={`${owners.length > 0 ? Math.round((paying / owners.length) * 100) : 0}% ${t("kpiConversion")}`} />
        <StatCard label={t("kpiOpenSupport")} value={String(openSupport)} icon="chat" tone="amber" href="/admin/support" />
        <StatCard label={t("kpiMessages")} value={String(newMessages)} icon="inbox" tone="rose" href="/admin/messages" />
      </div>

      {/* Inzichten: MRR, verdeling, groei, activiteit, recent */}
      <AdminInsights mrr={mrr} planCounts={planCounts} weeks={weeks} activity={activity} recent={recent} />

      <CreateUserForm canCreateAdmin={viewer.role === "OWNER"} />

      <Card className="overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="font-semibold text-white">{t("users")} ({users.length})</h2>
        </div>
        <UsersTable users={serialized} viewerRole={viewer.role} />
      </Card>
    </div>
  );
}
