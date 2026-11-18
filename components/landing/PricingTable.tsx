"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PLANS, ALL_FEATURES, PLAN_ORDER } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/Button";
import { PlanPrice } from "@/components/landing/billing";
import { useIsLaunched } from "@/components/company/LaunchStatus";
import { ExportGuaranteeNote } from "@/components/landing/ExportGuaranteeNote";
import type { Plan } from "@prisma/client";

// Rustige, donkere prijzentabel in de Ova-huisstijl. Het aanbevolen plan krijgt
// een violette rand en een witte knop; de rest een donkere knop.
// Betaalde plannen worden pas bij de officiële lancering te koop: elke knop
// leidt daarom naar een gratis registratie, met een korte uitleg eronder.
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
  const locale = useLocale();
  const launched = useIsLaunched();

  return (
    <div>
      <div className={cn("grid gap-6", cols)}>
        {plans.map((planId) => {
          const plan = PLANS[planId];
          const popular = planId === popularKey;
          return (
            <div
              key={planId}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-kaart p-6 sm:p-7",
                popular ? "border-saldova-licht/50" : "border-rand",
              )}
            >
              {popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-saldova px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                  {t("mostPopular")}
                </span>
              )}

              <h3 className="text-lg font-bold text-white">{t(`plans.${plan.key}.name`)}</h3>
              <p className="mt-1 text-sm text-slate-400">{t(`plans.${plan.key}.tagline`)}</p>

              <div className="mt-5">
                <PlanPrice amount={plan.price} />
              </div>

              <p className="mt-3 text-sm text-slate-400">{t(`plans.${plan.key}.desc`)}</p>

              {plan.maxMembers > 0 && (
                <p className="mt-3 rounded-lg border border-rand bg-grond px-3 py-2 text-xs font-medium text-slate-300">
                  {plan.seatPrice > 0
                    ? t("seatNote", { max: plan.maxMembers, price: plan.seatPrice.toLocaleString(locale === "nl" ? "nl-NL" : "en-US", { minimumFractionDigits: 2 }) })
                    : t("seatIncluded", { max: plan.maxMembers })}
                </p>
              )}

              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
                {ALL_FEATURES.map((feature) => {
                  const on = plan.features[feature];
                  return (
                    <li key={feature} className={cn("flex items-center gap-2.5", on ? "text-slate-200" : "text-slate-400")}>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                          on ? "bg-saldova/15 text-saldova-licht" : "bg-white/5 text-slate-500",
                        )}
                        aria-hidden
                      >
                        {on ? "✓" : "–"}
                      </span>
                      <span>
                        {t(`features.${feature}`)}
                        {!on && <span className="sr-only"> ({t("notIncluded")})</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <Link
                href={`/register?type=${accountType}`}
                className={cn(buttonClass(popular ? "primary" : "secondary", "lg"), "mt-7 w-full")}
              >
                {t("choose")}
              </Link>
            </div>
          );
        })}
      </div>
      {!launched && <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-400">{t("launchNote")}</p>}
      <ExportGuaranteeNote className={launched ? "mt-6" : "mt-3"} />
    </div>
  );
}
