import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { TaskManager } from "@/components/tasks/TaskManager";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations("team");
  const user = await requireUser();

  // Eigenaar of leidinggevende mag teamleden bekijken
  const canManage = can(user, "manageTeam");
  if (!canManage) redirect(`/${locale}/dashboard`);

  // Het teamlid moet bij dit account horen
  const member = await db.user.findFirst({
    where: { id, ownerId: user.accountId },
    select: { id: true, name: true, email: true, teamRole: true, createdAt: true, hourlyCost: true },
  });
  if (!member) notFound();

  // Activiteit van dit teamlid (door hem/haar aangemaakt, binnen het account)
  const acc = user.accountId;
  const year = new Date().getFullYear();
  const [times, miles, invCount, dbUser, ownerUser, members, projects, customers, leave, leaveBalance, leaveAgg, taskCounts, recentTimes, auditRows] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: acc, createdById: id }, select: { hours: true, hourlyRate: true, projectId: true, project: { select: { name: true } } } }),
    db.mileageEntry.findMany({ where: { userId: acc, createdById: id, type: "BUSINESS" }, select: { distanceKm: true } }),
    db.invoice.count({ where: { userId: acc, createdById: id } }),
    db.user.findUnique({ where: { id: acc }, select: { locale: true } }),
    db.user.findUnique({ where: { id: acc }, select: { id: true, name: true, email: true, company: { select: { name: true } } } }),
    db.user.findMany({ where: { ownerId: acc }, select: { id: true, name: true, email: true } }),
    db.project.findMany({ where: { userId: acc, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { userId: acc }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.leaveRequest.findMany({
      where: { userId: acc, requesterId: id },
      orderBy: { startDate: "desc" },
      take: 8,
      select: { id: true, type: true, status: true, startDate: true, endDate: true, hours: true },
    }),
    db.leaveBalance.findUnique({ where: { employeeId_year: { employeeId: id, year } }, select: { totalHours: true } }),
    // Verbruikt verlof over het HELE jaar (niet uit de gelimiteerde lijst hieronder).
    db.leaveRequest.aggregate({
      where: {
        userId: acc, requesterId: id, type: "VACATION", status: "APPROVED",
        startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      _sum: { hours: true },
    }),
    db.task.groupBy({ by: ["status"], where: { userId: acc, assignedToId: id }, _count: true }),
    db.timeEntry.findMany({
      where: { userId: acc, createdById: id },
      orderBy: { date: "desc" },
      take: 6,
      select: { id: true, date: true, hours: true, description: true },
    }),
    db.auditLog.findMany({
      where: { platform: false, accountId: acc, actorId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, action: true, target: true },
    }),
  ]);

  const localeStr = dbUser?.locale ?? "nl";
  const hours = times.reduce((s, e) => s + Number(e.hours), 0);
  const hoursValue = times.reduce((s, e) => s + Number(e.hours) * Number(e.hourlyRate ?? 0), 0);
  const km = miles.reduce((s, e) => s + Number(e.distanceKm), 0);
  const name = member.name ?? member.email;

  // Marge per project: gefactureerd uurtarief vs. bruto uurloon (kostprijs) van deze medewerker
  const showCosts = can(user, "financials");
  const hourlyCost = member.hourlyCost === null ? null : Number(member.hourlyCost);
  const perProject = new Map<string, { name: string; hours: number; revenue: number }>();
  for (const e of times) {
    const key = e.projectId ?? "__none";
    const cur = perProject.get(key) ?? { name: e.project?.name ?? t("noProject"), hours: 0, revenue: 0 };
    cur.hours += Number(e.hours);
    cur.revenue += Number(e.hours) * Number(e.hourlyRate ?? 0);
    perProject.set(key, cur);
  }
  const marginRows = [...perProject.values()].map((r) => ({ ...r, cost: hourlyCost === null ? null : r.hours * hourlyCost })).sort((a, b) => b.hours - a.hours);

  // Verlofbudget dit jaar: alleen goedgekeurde vakantie telt af
  const leaveTotal = Number(leaveBalance?.totalHours ?? 200);
  // Volledig verbruik uit de aggregatie — niet uit de (op 8 gelimiteerde) lijst.
  const leaveUsed = Number(leaveAgg._sum.hours ?? 0);
  const tasksOpen = taskCounts.find((c) => c.status === "TODO")?._count ?? 0;
  const tasksDone = taskCounts.find((c) => c.status === "DONE")?._count ?? 0;

  const teamOptions = [
    ...(ownerUser ? [{ id: ownerUser.id, name: ownerUser.company?.name ?? ownerUser.name ?? ownerUser.email }] : []),
    ...members.map((m) => ({ id: m.id, name: m.name ?? m.email })),
  ];

  return (
    <div>
      <PageHeader
        title={name}
        subtitle={t(member.teamRole === "MANAGER" ? "roleManager" : "roleMember")}
        action={
          <Link href="/team" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ← {t("title")}
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        {/* Stats van deze medewerker */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("colHours")} value={`${hours.toFixed(1)} u`} icon="clock" tone="teal" sub={can(user, "financials") ? formatMoney(hoursValue, localeStr) : undefined} />
          <StatCard label={t("colKm")} value={`${km.toFixed(0)} km`} icon="car" tone="brand" />
          <StatCard label={t("colInvoices")} value={String(invCount)} icon="receipt" tone="green" />
          <StatCard label={t("memberSince")} value={member.createdAt.toISOString().slice(0, 10)} icon="calendar" tone="amber" />
        </div>

        {/* Verlof + taken + recente uren + activiteit */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <h2 className="font-semibold text-white">{t("memberLeave", { year })}</h2>
            <p className="mt-2 text-2xl font-bold text-white">
              {leaveTotal - leaveUsed} <span className="text-sm font-medium text-slate-500">/ {leaveTotal} {t("hoursLeft")}</span>
            </p>
            {leave.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t("noLeave")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/[0.04] text-sm">
                {leave.slice(0, 5).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="truncate text-slate-400">
                      {l.startDate.toISOString().slice(0, 10)} · {Number(l.hours)}u
                    </span>
                    <LeaveStatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
            <Link href="/verlof" className="mt-3 inline-block text-xs font-semibold text-brand-400 hover:underline">{t("toLeave")} →</Link>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-white">{t("memberHoursRecent")}</h2>
            <p className="mt-2 text-2xl font-bold text-white">
              {tasksOpen} <span className="text-sm font-medium text-slate-500">{t("openTasksShort")}</span>
              <span className="ml-3 text-2xl font-bold text-emerald-400">{tasksDone}</span> <span className="text-sm font-medium text-slate-500">{t("doneTasksShort")}</span>
            </p>
            {recentTimes.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t("noHours")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/[0.04] text-sm">
                {recentTimes.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="truncate text-slate-400">{e.description}</span>
                    <span className="shrink-0 text-slate-400">{e.date.toISOString().slice(0, 10)} · {Number(e.hours)}u</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-white">{t("memberActivity")}</h2>
            {auditRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t("noActivity")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/[0.04] text-sm">
                {auditRows.map((a) => (
                  <li key={a.id} className="py-1.5">
                    <p className="truncate text-slate-300">{a.target ?? a.action}</p>
                    <p className="text-xs text-slate-500">{a.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {a.action}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/activiteit" className="mt-3 inline-block text-xs font-semibold text-brand-400 hover:underline">{t("toActivity")} →</Link>
          </Card>
        </div>

        {/* Marge per project: opbrengst (uren x tarief) vs. kosten (uren x bruto uurloon) */}
        {showCosts && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3">
              <div>
                <h2 className="font-semibold text-white">{t("marginTitle")}</h2>
                <p className="text-xs text-slate-400">{hourlyCost === null ? t("marginNoCost") : t("marginSub", { cost: formatMoney(hourlyCost, localeStr) })}</p>
              </div>
              <Link href="/team" className="text-xs font-semibold text-brand-400 hover:underline">{t("marginSetCost")} →</Link>
            </div>
            {marginRows.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">{t("noHours")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">{t("colProject")}</th>
                      <th className="px-5 py-2.5 text-right font-medium">{t("colHours")}</th>
                      <th className="px-5 py-2.5 text-right font-medium">{t("colRevenue")}</th>
                      <th className="px-5 py-2.5 text-right font-medium">{t("colCost")}</th>
                      <th className="px-5 py-2.5 text-right font-medium">{t("colMargin")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {marginRows.map((r) => {
                      const margin = r.cost === null ? null : r.revenue - r.cost;
                      const pct = margin !== null && r.revenue > 0 ? Math.round((margin / r.revenue) * 100) : null;
                      return (
                        <tr key={r.name}>
                          <td className="px-5 py-2.5 font-medium text-white">{r.name}</td>
                          <td className="tabular px-5 py-2.5 text-right text-slate-300">{r.hours.toFixed(1)} u</td>
                          <td className="tabular px-5 py-2.5 text-right text-slate-300">{formatMoney(r.revenue, localeStr)}</td>
                          <td className="tabular px-5 py-2.5 text-right text-slate-300">{r.cost === null ? "—" : formatMoney(r.cost, localeStr)}</td>
                          <td className={`tabular px-5 py-2.5 text-right font-semibold ${margin === null ? "text-slate-500" : margin >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {margin === null ? "—" : `${formatMoney(margin, localeStr)}${pct !== null ? ` (${pct}%)` : ""}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Taken van/voor deze medewerker */}
        <div>
          <h2 className="mb-3 font-semibold text-white">{t("memberTasks")}</h2>
          <TaskManager teamOptions={teamOptions} currentUserId={user.id} fixedAssigneeId={member.id} projectOptions={projects} customerOptions={customers} />
        </div>
      </div>
    </div>
  );
}

// Klein statuslabel voor verlofregels
function LeaveStatusBadge({ status }: { status: string }) {
  const style =
    status === "APPROVED"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "PENDING"
        ? "bg-amber-500/15 text-amber-300"
        : status === "REJECTED"
          ? "bg-rose-500/15 text-rose-300"
          : "bg-white/5 text-slate-400";
  const label = status === "APPROVED" ? "OK" : status === "PENDING" ? "..." : status === "REJECTED" ? "X" : "—";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}
