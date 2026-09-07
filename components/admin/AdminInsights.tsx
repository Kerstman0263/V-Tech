import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PLAN_ORDER } from "@/lib/plans";
import type { Plan } from "@prisma/client";

export interface WeekPoint {
  label: string;
  count: number;
}

export interface RecentAccount {
  id: string;
  name: string;
  email: string;
  plan: Plan | null;
  isMember: boolean;
  createdAt: string;
}

const planTone: Record<Plan, string> = {
  FREE: "from-slate-500 to-slate-400",
  GROWTH: "from-blue-500 to-sky-400",
  PRO: "from-brand-500 to-fuchsia-400",
  BUSINESS: "from-teal-500 to-cyan-400",
  BUSINESS_PLUS: "from-amber-500 to-orange-400",
};

const money = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/**
 * Beheer-inzichten: MRR + abonnementsverdeling, groei per week,
 * platform-activiteit en de laatste registraties. Puur presentatie —
 * alle cijfers komen server-side uit admin/page.tsx.
 */
export async function AdminInsights({
  mrr,
  planCounts,
  weeks,
  activity,
  recent,
}: {
  mrr: number;
  planCounts: Record<Plan, number>;
  weeks: WeekPoint[];
  activity: { key: string; icon: IconName; value: number }[];
  recent: RecentAccount[];
}) {
  const t = await getTranslations("admin");
  const tp = await getTranslations("pricing");
  const totalOwners = Object.values(planCounts).reduce((a, b) => a + b, 0) || 1;
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* MRR + verdeling */}
      <Card className="relative overflow-hidden p-5 lg:col-span-1">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-500/20 blur-3xl" />
        <p className="text-sm font-medium text-slate-400">{t("mrr")}</p>
        <p className="tabular mt-1 text-3xl font-extrabold tracking-tight text-white">{money(mrr)}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("mrrSub")}</p>

        <p className="mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("planDist")}</p>
        <div className="mt-2 space-y-2">
          {PLAN_ORDER.map((plan) => {
            const n = planCounts[plan] ?? 0;
            const pct = Math.round((n / totalOwners) * 100);
            return (
              <div key={plan}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{tp(`plans.${plan.toLowerCase()}.name`)}</span>
                  <span className="tabular text-slate-400">
                    {n} · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                  <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", planTone[plan])} style={{ width: `${Math.max(pct, n > 0 ? 3 : 0)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Groei per week */}
      <Card className="p-5 lg:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">{t("growth")}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t("growthSub")}</p>
          </div>
          <p className="tabular text-2xl font-extrabold text-white">+{weeks.reduce((a, w) => a + w.count, 0)}</p>
        </div>
        <div className="mt-5 flex h-36 items-end gap-2">
          {weeks.map((w) => (
            <div key={w.label} className="group flex flex-1 flex-col items-center gap-1.5">
              <span className="tabular text-[10px] font-semibold text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">{w.count}</span>
              <div
                className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 transition-all duration-300 group-hover:from-brand-500 group-hover:to-fuchsia-400"
                style={{ height: `${Math.max(4, (w.count / maxWeek) * 100)}%` }}
              />
              <span className="text-[10px] text-slate-500">{w.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Platform-activiteit */}
      <Card className="p-5 lg:col-span-2">
        <p className="text-sm font-medium text-slate-400">{t("activity")}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {activity.map((a) => (
            <div key={a.key} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Icon name={a.icon} className="h-4 w-4 text-brand-300" />
                <span className="text-xs">{t(`activityKeys.${a.key}`)}</span>
              </div>
              <p className="tabular mt-1.5 text-xl font-bold text-white">{a.value.toLocaleString("nl-NL")}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Laatste registraties */}
      <Card className="p-5 lg:col-span-1">
        <p className="text-sm font-medium text-slate-400">{t("recent")}</p>
        <ul className="mt-3 space-y-2.5">
          {recent.length === 0 && <li className="text-sm text-slate-500">—</li>}
          {recent.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-[10px] font-bold text-white">
                {r.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{r.name}</span>
                <span className="block truncate text-xs text-slate-500">{r.email}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[10px] font-semibold text-brand-300">{r.isMember ? t("memberBadge") : r.plan ?? "FREE"}</span>
                <span className="block text-[10px] text-slate-500">{r.createdAt}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
