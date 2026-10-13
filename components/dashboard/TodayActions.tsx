import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { TodayAction, TodayActionKey } from "@/lib/today-actions";

// Eén icoon per soort actie, zodat je in één oogopslag ziet waar het over gaat.
const ICONS: Record<TodayActionKey, Parameters<typeof Icon>[0]["name"]> = {
  lateInvoices: "alert",
  vatReturn: "calendar",
  draftInvoices: "send",
  unbilledHours: "timer",
  expiringQuotes: "hourglass",
  addIban: "wallet",
  companyDetails: "building",
};

const TONES: Record<TodayAction["tone"], string> = {
  urgent: "bg-rose-500/15 text-rose-300",
  money: "bg-emerald-500/15 text-emerald-300",
  info: "bg-brand-500/15 text-brand-200",
};

/**
 * "Vandaag doen": in gewone taal wat er nu aandacht nodig heeft, met per
 * regel één grote knop. Leeg = een geruststellende melding dat alles bij is.
 */
export async function TodayActions({ actions }: { actions: TodayAction[] }) {
  const t = await getTranslations("dashboard.today");

  return (
    <section aria-labelledby="today-title" className="rounded-2xl border border-white/[0.08] bg-[#12112a]/70 p-5 backdrop-blur-md sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="today-title" className="text-lg font-semibold text-white">{t("title")}</h2>
        {actions.length > 0 && <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-300">{t("count", { count: actions.length })}</span>}
      </div>

      {actions.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
            <Icon name="check-circle" className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-white">{t("allDoneTitle")}</p>
            <p className="text-sm text-slate-400">{t("allDoneBody")}</p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {actions.map((a) => (
            <li key={a.key} className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:flex-row sm:items-center">
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONES[a.tone])}>
                <Icon name={ICONS[a.key]} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">{t(`${a.key}.title`, a.values)}</p>
                <p className="text-sm text-slate-400">{t(`${a.key}.body`, a.values)}</p>
              </div>
              <Link
                href={a.href}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
              >
                {t(`${a.key}.cta`)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
