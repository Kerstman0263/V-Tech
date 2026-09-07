"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PLANS } from "@/lib/plans";
import { yearlyTotal } from "@/lib/marketing";
import { cn } from "@/lib/utils";
import { useBilling, TweenPrice } from "@/components/landing/billing";

// Bespoke prijskaarten voor de bedrijvenpagina (Business & Business +),
// bedoeld voor de donkere pricing-band. Business = subtiele glass-kaart;
// Business + is de winnaar met een paarse rand + gloed, 'Meest gekozen'-badge
// en een gevulde paarse CTA. De knoppen sturen de plankeuze mee naar de
// registratie (?type=bedrijf&plan=...).
//
// Styling: volledig Tailwind CSS. Prijzen/teamlimieten uit lib/plans.ts,
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
  const tb = useTranslations("pricing.billing");
  const { period } = useBilling();
  const business = PLANS.BUSINESS;
  const plus = PLANS.BUSINESS_PLUS;

  const businessFeatures = t.raw("business.features") as string[];
  const plusFeatures = t.raw("plus.features") as string[];

  return (
    <>
    <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-8">
      {/* ── Business — subtiele glass-kaart ───────────────────────── */}
      <div className="relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur transition-all duration-200 ease-in-out hover:-translate-y-1 hover:bg-white/[0.05]">
        <h3 className="text-xl font-bold text-white">{t("business.name")}</h3>
        <p className="mt-1 text-sm text-slate-400">{t("business.tagline")}</p>

        <div className="mt-5 flex items-baseline gap-1">
          <TweenPrice monthly={business.price} className="text-4xl font-extrabold tracking-tight text-white" />
          <span className="text-sm text-slate-400">{t("perMonth")}</span>
        </div>
        <p className={cn("mt-1 h-4 text-xs text-emerald-300 transition-opacity duration-300", period === "yearly" ? "opacity-100" : "opacity-0")}>
          {tb("yearlyTotal", { total: yearlyTotal(business.price) })}
        </p>

        <p className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
          {t("seatsIncluded", { max: business.maxMembers })}
        </p>

        <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm">
          {businessFeatures.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-slate-200">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                <CheckIcon className="h-3 w-3" />
              </span>
              {f}
            </li>
          ))}
        </ul>

        <Link
          href="/register?type=bedrijf&plan=business"
          className="mt-8 rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white transition-all duration-200 ease-in-out hover:bg-white/5 active:scale-[0.98]"
        >
          {t("business.cta")}
        </Link>
      </div>

      {/* ── Business + — de winnaar ───────────────────────────────── */}
      <div className="relative flex flex-col overflow-hidden rounded-2xl border border-purple-500/50 bg-brand-500/[0.07] p-8 shadow-glow-lg backdrop-blur transition-all duration-200 ease-in-out lg:-translate-y-3 lg:scale-[1.02] hover:lg:-translate-y-4">
        {/* subtiele gloed rechtsboven */}
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand-500/25 blur-3xl" />

        {/* Meest gekozen-badge */}
        <span className="absolute right-6 top-6 rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-glow-md">
          {t("badge")}
        </span>

        <div className="relative">
          <h3 className="text-xl font-bold text-white">{t("plus.name")}</h3>
          <p className="mt-1 text-sm text-brand-200">{t("plus.tagline")}</p>

          <div className="mt-5 flex items-baseline gap-1">
            <TweenPrice monthly={plus.price} className="text-4xl font-extrabold tracking-tight text-white" />
            <span className="text-sm text-brand-300">{t("perMonth")}</span>
          </div>
          <p className={cn("mt-1 h-4 text-xs text-emerald-300 transition-opacity duration-300", period === "yearly" ? "opacity-100" : "opacity-0")}>
            {tb("yearlyTotal", { total: yearlyTotal(plus.price) })}
          </p>

          <p className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
            {t("seatsIncluded", { max: plus.maxMembers })}
          </p>

          <p className="mt-6 text-sm font-semibold text-brand-200">{t("plus.allOfBusiness")}</p>
          <ul className="mt-3 flex flex-1 flex-col gap-3 text-sm">
            {plusFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-white">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-ink-950">
                  <CheckIcon className="h-3 w-3" />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <Link
            href="/register?type=bedrijf&plan=business_plus"
            className="mt-8 block rounded-xl bg-gradient-to-r from-brand-500 to-fuchsia-500 px-4 py-3 text-center text-sm font-bold text-white shadow-glow-md transition-all duration-200 ease-in-out hover:from-brand-400 hover:to-fuchsia-400 hover:shadow-glow-lg active:scale-[0.98]"
          >
            {t("plus.cta")}
          </Link>
        </div>
      </div>
    </div>
    {/* Proefperiode: bedrijven starten 30 dagen gratis op Business */}
    <p className="mx-auto mt-6 max-w-2xl rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-center text-sm text-emerald-200">
      {t("trialNote")}
    </p>
    </>
  );
}
