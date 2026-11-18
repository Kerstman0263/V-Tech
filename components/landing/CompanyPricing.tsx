import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/Button";
import { PlanPrice } from "@/components/landing/billing";

// Prijskaarten voor de bedrijvenpagina (Business & Business +) in de Ova-huisstijl.
// Business + is aanbevolen (violette rand, witte knop). Betaalde plannen worden pas
// bij de officiële lancering te koop: beide knoppen starten de gratis proefperiode
// van 30 dagen (registratie als bedrijf). Prijzen/teamlimieten uit lib/plans.ts,
// featurebullets uit messages onder "companyPricing".

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CompanyPricing() {
  const t = useTranslations("companyPricing");
  const tp = useTranslations("pricing");
  const business = PLANS.BUSINESS;
  const plus = PLANS.BUSINESS_PLUS;

  const businessFeatures = t.raw("business.features") as string[];
  const plusFeatures = t.raw("plus.features") as string[];

  return (
    <>
      <div className="grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Business */}
        <div className="relative flex flex-col rounded-2xl border border-rand bg-kaart p-6 sm:p-8">
          <h3 className="text-xl font-bold text-white">{t("business.name")}</h3>
          <p className="mt-1 text-sm text-slate-400">{t("business.tagline")}</p>

          <div className="mt-5">
            <PlanPrice amount={business.price} />
          </div>

          <p className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-rand bg-grond px-3 py-1 text-xs font-semibold text-slate-300">
            {t("seatsIncluded", { max: business.maxMembers })}
          </p>

          <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm">
            {businessFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-slate-200">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-saldova/15 text-saldova-licht">
                  <CheckIcon className="h-3 w-3" />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <Link href="/register?type=bedrijf" className={cn(buttonClass("secondary", "lg"), "mt-8 w-full")}>
            {t("business.cta")}
          </Link>
        </div>

        {/* Business + — aanbevolen */}
        <div className="relative flex flex-col rounded-2xl border border-saldova-licht/50 bg-kaart p-6 sm:p-8">
          <span className="absolute right-6 top-6 rounded-full bg-saldova px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            {t("badge")}
          </span>

          <h3 className="pr-28 text-xl font-bold text-white">{t("plus.name")}</h3>
          <p className="mt-1 text-sm text-slate-400">{t("plus.tagline")}</p>

          <div className="mt-5">
            <PlanPrice amount={plus.price} />
          </div>

          <p className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-rand bg-grond px-3 py-1 text-xs font-semibold text-slate-300">
            {t("seatsIncluded", { max: plus.maxMembers })}
          </p>

          <p className="mt-6 text-sm font-semibold text-slate-200">{t("plus.allOfBusiness")}</p>
          <ul className="mt-3 flex flex-1 flex-col gap-3 text-sm">
            {plusFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-white">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-saldova text-white">
                  <CheckIcon className="h-3 w-3" />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <Link href="/register?type=bedrijf" className={cn(buttonClass("primary", "lg"), "mt-8 w-full")}>
            {t("plus.cta")}
          </Link>
        </div>
      </div>
      {/* Proefperiode: bedrijven starten 30 dagen gratis op Business */}
      <p className="mx-auto mt-6 max-w-2xl rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-center text-sm text-emerald-200">
        {t("trialNote")}
      </p>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-400">{tp("launchNote")}</p>
    </>
  );
}
