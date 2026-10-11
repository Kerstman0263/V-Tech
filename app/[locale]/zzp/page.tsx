import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PricingTable } from "@/components/landing/PricingTable";
import { Faq } from "@/components/landing/Faq";
import { LaunchBanner } from "@/components/landing/LaunchBanner";
import { TrustBar } from "@/components/landing/TrustBar";
import { Icon } from "@/components/ui/Icon";
import { SocialProof } from "@/components/landing/SocialProof";
import { GuaranteeBar } from "@/components/landing/GuaranteeBar";
import { UrencriteriumCheck } from "@/components/landing/UrencriteriumCheck";
import { MockDashboard } from "@/components/landing/MockDashboard";
import { BillingProvider, BillingToggle } from "@/components/landing/billing";
import { DemoLoginButton } from "@/components/auth/DemoLoginButton";
import { ACCOUNTANT_HOURLY_EUR } from "@/lib/marketing";
import { SOLO_PLANS } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "zzp");
}

// Zzp-pagina: het volledige verhaal voor zelfstandigen (voorheen de homepage).
export default function ZzpPage() {
  const t = useTranslations("landing");
  const tp = useTranslations("pricing");

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <LaunchBanner />
      <SiteHeader />

      {/* Hero — premium, high-end SaaS (Linear/Vercel-stijl) */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "28px 28px" }}
          />
          <div
            className="absolute left-1/2 top-16 h-[520px] w-[920px] max-w-full -translate-x-1/2 rounded-full blur-[150px]"
            style={{ background: "radial-gradient(ellipse at center, rgba(99,102,241,0.20), rgba(124,58,237,0.10) 45%, transparent 70%)" }}
          />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-surface" />
        </div>

        <div className="mx-auto max-w-4xl px-6 pb-4 pt-28 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-sm font-medium text-brand-300 backdrop-blur">
            {t("hero.badge")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            <span className="bg-gradient-to-b from-white to-[#b6bdc9] bg-clip-text text-transparent">{t("hero.title")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">{t("hero.subtitle")}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register?type=zzp"
              className="rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all duration-300 hover:scale-[1.02] hover:bg-brand-500 hover:shadow-[0_0_30px_rgba(124,58,237,0.5)] active:scale-[0.99]"
            >
              {t("hero.cta")}
            </Link>
            <DemoLoginButton variant="hero" label={t("hero.ctaDemo")} />
          </div>
          <div className="mt-4">
            <a href="#pricing" className="text-sm font-medium text-slate-400 transition-colors hover:text-white">
              {t("hero.ctaSecondary")} →
            </a>
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl px-6">
          <div aria-hidden className="pointer-events-none absolute -top-8 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
          <div className="animate-fade-in-up rounded-2xl border border-white/[0.08] shadow-[0_-20px_50px_rgba(124,58,237,0.1)] [mask-image:linear-gradient(to_bottom,black_82%,transparent)]">
            <MockDashboard variant="free" />
          </div>
        </div>

        <p className="mt-10 px-6 text-center text-sm text-slate-500">{t("hero.trust")}</p>
      </section>

      <TrustBar />

      {/* Product tour */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("tour.title")}</h2>
            <p className="mt-3 text-slate-400">{t("tour.subtitle")}</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {(["invoices", "time", "mileage"] as const).map((tool, i) => (
              <div key={tool} className="card-glass p-6 transition-all duration-200 hover:-translate-y-1 hover:bg-white/[0.04]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300">
                  <Icon name={(["receipt", "clock", "car"] as const)[i]} className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{t(`tour.${tool}.title`)}</h3>
                <p className="mt-2 text-sm text-slate-400">{t(`tour.${tool}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SocialProof />

      {/* Urencriterium-check */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-brand-300 backdrop-blur">
              {t("urenSection.badge")}
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("urenSection.title")}</h2>
            <p className="mt-3 text-slate-400">{t("urenSection.subtitle")}</p>
          </div>
          <div className="mt-14">
            <UrencriteriumCheck />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative overflow-hidden border-y border-white/[0.06] bg-panel/40 py-24">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-72 max-w-3xl rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("pricingSection.title")}</h2>
            <p className="mt-3 text-slate-400">{t("pricingSection.subtitle")}</p>
            <p className="mt-4 text-sm font-medium text-brand-300">{t("pricingSection.trial")}</p>
          </div>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center">
            <p className="text-sm text-slate-300">{t("pricingSection.anchor", { rate: ACCOUNTANT_HOURLY_EUR })}</p>
          </div>

          <BillingProvider>
            <div className="mt-10 flex justify-center">
              <BillingToggle />
            </div>
            <div className="mt-12">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">{tp("groupSolo.title")}</h3>
                <p className="text-sm text-slate-400">{tp("groupSolo.subtitle")}</p>
              </div>
              <PricingTable plans={SOLO_PLANS} cols="md:grid-cols-3" popularKey="PRO" accountType="zzp" />
            </div>
          </BillingProvider>

          <div className="mt-14 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-6 text-center backdrop-blur transition-all duration-200 hover:bg-white/[0.05] sm:flex-row sm:text-left">
            <div>
              <h3 className="text-lg font-bold text-white">{tp("groupBusiness.title")}</h3>
              <p className="text-sm text-slate-400">{tp("groupBusiness.subtitle")}</p>
            </div>
            <Link href="/bedrijven" className="shrink-0 rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/5">
              {t("pricingSection.companyCta")} →
            </Link>
          </div>

          <GuaranteeBar />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("faqSection.title")}</h2>
            <p className="mt-3 text-slate-400">{t("faqSection.subtitle")}</p>
          </div>
          <div className="mt-14"><Faq /></div>
          <div className="mt-8 text-center">
            <Link href="/faq" className="text-sm font-semibold text-brand-400 hover:text-brand-300 hover:underline">
              {t("faqSection.viewAll")} →
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-brand-700 via-brand-800 to-ink-950 px-6 py-16 text-center shadow-glow-lg">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("cta.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-200">{t("cta.subtitle")}</p>
            <Link href="/register?type=zzp" className="mt-8 inline-block rounded-xl bg-white px-7 py-3.5 font-semibold text-brand-700 shadow-lg transition-all duration-200 hover:bg-brand-50 active:scale-[0.98]">
              {t("cta.button")}
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
