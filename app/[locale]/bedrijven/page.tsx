import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { CompanyPricing } from "@/components/landing/CompanyPricing";
import { BillingProvider, BillingToggle } from "@/components/landing/billing";
import { MockDashboard } from "@/components/landing/MockDashboard";
import { Icon, type IconName } from "@/components/ui/Icon";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "bedrijven");
}

// Productpagina voor bedrijven met personeel — het tweede gezicht van
// Saldova naast de zzp-tool op de homepage.
export default async function CompaniesPage() {
  const t = await getTranslations("companies");

  const features: { key: string; icon: IconName }[] = [
    { key: "leave", icon: "sun" },
    { key: "hours", icon: "clock" },
    { key: "tasks", icon: "check-circle" },
    { key: "roles", icon: "shield" },
    { key: "invoicing", icon: "receipt" },
    { key: "overview", icon: "users" },
  ];

  const steps = ["step1", "step2", "step3"] as const;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />

      {/* Hero — radial gloed + gradient-titel */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[380px] w-[760px] max-w-full -translate-x-1/2 rounded-full bg-brand-600/15 blur-[130px]" />
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-sm font-medium text-brand-300 backdrop-blur">
            {t("badge")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            <span className="text-hero-gradient">{t("title")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register?type=bedrijf"
              className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-glow-md transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-lg active:scale-[0.98]"
            >
              {t("cta")}
            </Link>
            <Link
              href="#pricing"
              className="rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/5"
            >
              {t("ctaSecondary")}
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">{t("trust")}</p>

          {/* Nagemaakt mini-dashboard — Business-indeling */}
          <div className="mx-auto mt-14 max-w-4xl text-left">
            <MockDashboard variant="business" />
          </div>
        </div>
      </section>

      {/* Functies */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("featuresTitle")}</h2>
            <p className="mt-3 text-slate-400">{t("featuresSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.key} className="card-glass p-6 transition-all duration-200 hover:-translate-y-1 hover:bg-white/[0.04]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300">
                  <Icon name={f.icon} className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{t(`features.${f.key}.title`)}</h3>
                <p className="mt-2 text-sm text-slate-400">{t(`features.${f.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Zo werkt het */}
      <section className="border-y border-white/[0.06] bg-white/[0.02] py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("howTitle")}</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s} className="card-glass p-6 transition-all duration-200 hover:bg-white/[0.04]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-glow">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold text-white">{t(`how.${s}.title`)}</h3>
                <p className="mt-1.5 text-sm text-slate-400">{t(`how.${s}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Prijzen — premium donkere band, alleen de bedrijfsplannen */}
      <section id="pricing" className="relative overflow-hidden border-y border-white/[0.06] bg-panel/40 py-20">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-72 max-w-3xl rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("pricingTitle")}</h2>
            <p className="mt-3 text-slate-400">{t("pricingSubtitle")}</p>
            <p className="mt-4 text-sm font-medium text-brand-300">{t("trial")}</p>
          </div>
          <BillingProvider>
            <div className="mt-10 flex justify-center">
              <BillingToggle />
            </div>
            <div className="mt-12">
              <CompanyPricing />
            </div>
          </BillingProvider>
        </div>
      </section>

      {/* Slot-CTA — gloeiende paarse band */}
      <section className="px-6 py-20">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-brand-600 via-brand-800 to-ink-950 p-10 text-center text-white shadow-glow-lg">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl font-bold sm:text-3xl">{t("finalTitle")}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-brand-200">{t("finalSubtitle")}</p>
            <Link
              href="/register?type=bedrijf"
              className="mt-6 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition-all duration-200 hover:bg-brand-50 active:scale-[0.98]"
            >
              {t("cta")}
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
