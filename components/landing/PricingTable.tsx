"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PLANS, ALL_FEATURES, PLAN_ORDER } from "@/lib/plans";
import { yearlyTotal } from "@/lib/marketing";
import { cn } from "@/lib/utils";
import { useBilling, TweenPrice } from "@/components/landing/billing";
import type { Plan } from "@prisma/client";

// Premium, donkere prijzentabel (bedoeld voor de donkere pricing-band).
// Het populaire plan springt eruit met een paarse rand + gloed en een
// gevulde CTA; de overige plannen krijgen een subtiele transparante knop.
// De knop stuurt de plankeuze mee naar de registratie (?type=zzp&plan=...).
export function PricingTable({
  plans = PLAN_ORDER,
  cols = "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
  popularKey = "PRO",
  accountType = "zzp",
}: {
  plans?: Plan[];
  cols?: string;
  popularKey?: Plan;
  accountType?: "zzp" | "bedrijf";
}) {
  const t = useTranslations("pricing");
  const { period } = useBilling();

  return (
    <div className={cn("grid gap-6", cols)}>
      {plans.map((planId) => {
        const plan = PLANS[planId];
        const popular = planId === popularKey;
        return (
          <div
            key={planId}
            className={cn(
              "relative flex flex-col rounded-2xl border p-7 transition-all duration-200 ease-in-out hover:-translate-y-1",
              popular
                ? "border-purple-500/50 bg-brand-500/[0.06] shadow-glow-lg"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
            )}
          >
            {popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-glow-md">
                {t("mostPopular")}
              </span>
            )}

            <h3 className="text-lg font-bold text-white">{t(`plans.${plan.key}.name`)}</h3>
            <p className="mt-1 text-sm text-slate-400">{t(`plans.${plan.key}.tagline`)}</p>

            <div className="mt-5 flex items-baseline gap-1">
              {plan.price === 0 ? (
                <span className="text-4xl font-extrabold tracking-tight text-white">{t("free_price")}</span>
              ) : (
                <>
                  <TweenPrice monthly={plan.price} className="text-4xl font-extrabold tracking-tight text-white" />
                  <span className="text-sm text-slate-400">{t("perMonth")}</span>
                </>
              )}
            </div>
            {/* Jaartotaal — alleen bij jaarbetaling en betaalde plannen */}
            <p className={cn("mt-1 h-4 text-xs text-emerald-300 transition-opacity duration-300", period === "yearly" && plan.price > 0 ? "opacity-100" : "opacity-0")}>
              {plan.price > 0 ? t("billing.yearlyTotal", { total: yearlyTotal(plan.price) }) : ""}
            </p>

            <p className="mt-3 text-sm text-slate-400">{t(`plans.${plan.key}.desc`)}</p>

            {plan.maxMembers > 0 && (
              <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 ring-1 ring-white/10">
                {plan.seatPrice > 0
                  ? t("seatNote", { max: plan.maxMembers, price: plan.seatPrice.toFixed(2) })
                  : t("seatIncluded", { max: plan.maxMembers })}
              </p>
            )}

            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
              {ALL_FEATURES.map((feature) => {
                const on = plan.features[feature];
                return (
                  <li key={feature} className={cn("flex items-center gap-2.5", on ? "text-slate-200" : "text-slate-600")}>
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                        on ? "bg-brand-500/20 text-brand-300" : "bg-white/5 text-slate-600",
                      )}
                      aria-hidden
                    >
                      {on ? "✓" : "–"}
                    </span>
                    {t(`features.${feature}`)}
                  </li>
                );
              })}
            </ul>

            <Link
              href={`/register?type=${accountType}&plan=${plan.key}`}
              className={cn(
                "mt-7 rounded-xl px-4 py-3 text-center text-sm font-semibold transition-all duration-200 ease-in-out active:scale-[0.98]",
                popular
                  ? "bg-brand-600 text-white shadow-glow-md hover:bg-brand-500 hover:shadow-glow-lg"
                  : "border border-white/10 text-white hover:bg-white/5",
              )}
            >
              {t("choose")}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
