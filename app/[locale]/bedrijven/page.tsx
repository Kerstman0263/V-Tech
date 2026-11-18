import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { CompanyPricing } from "@/components/landing/CompanyPricing";
import { MockDashboard } from "@/components/landing/MockDashboard";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
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
    <div className="flex min-h-screen flex-col bg-grond">
      <SiteHeader />

      {/* Hero — één zachte violette gloed */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-rand bg-kaart px-4 py-1.5 text-sm font-medium text-saldova-licht">
            {t("badge")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{t("title")}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">{t("subtitle")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register?type=bedrijf" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
              {t("cta")}
            </Link>
            <a href="#pricing" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
              {t("ctaSecondary")}
            </a>
          </div>
          <p className="mt-4 text-xs text-slate-400">{t("trust")}</p>

          {/* Nagemaakt mini-dashboard — Business-indeling */}
          <div className="mx-auto mt-14 max-w-4xl text-left">
            <MockDashboard variant="business" />
          </div>
        </div>
      </section>

      {/* Functies */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("featuresTitle")}</h2>
            <p className="mt-3 text-slate-400">{t("featuresSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.key} className="card-glass p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht">
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
      <section className="border-y border-rand bg-kaart/40 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("howTitle")}</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s} className="card-glass p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-saldova text-sm font-bold text-white">
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
      <section id="pricing" className="border-y border-rand py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("pricingTitle")}</h2>
            <p className="mt-3 text-slate-400">{t("pricingSubtitle")}</p>
            <p className="mt-4 text-sm font-medium text-saldova-licht">{t("trial")}</p>
          </div>
          <div className="mt-12">
            <CompanyPricing />
          </div>
        </div>
      </section>

      {/* Slot-CTA — rustige kaart met witte knop */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-rand bg-kaart p-8 text-center text-white sm:p-10">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("finalTitle")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">{t("finalSubtitle")}</p>
          <Link href="/register?type=bedrijf" className={cn(buttonClass("primary", "lg"), "mt-6 w-full sm:w-auto")}>
            {t("cta")}
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
