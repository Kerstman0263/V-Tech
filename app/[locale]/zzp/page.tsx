import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PricingTable } from "@/components/landing/PricingTable";
import { Faq } from "@/components/landing/Faq";
import { LaunchBanner } from "@/components/landing/LaunchBanner";
import { TrustBar } from "@/components/landing/TrustBar";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/ui/Button";
import { SocialProof } from "@/components/landing/SocialProof";
import { GuaranteeBar } from "@/components/landing/GuaranteeBar";
import { UrencriteriumCheck } from "@/components/landing/UrencriteriumCheck";
import { MockDashboard } from "@/components/landing/MockDashboard";
import { DemoLoginButton } from "@/components/auth/DemoLoginButton";
import { StartgesprekCta } from "@/components/contact/StartgesprekCta";
import { ACCOUNTANT_HOURLY_EUR } from "@/lib/marketing";
import { FREELANCER_PLANS } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { isLaunched } from "@/lib/company";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "zzp");
}

// Zzp-pagina: het volledige verhaal voor zelfstandigen, in de Ova-huisstijl.
export default function ZzpPage() {
  const t = useTranslations("landing");
  const tp = useTranslations("pricing");
  const launched = isLaunched();

  return (
    <div className="flex min-h-screen flex-col bg-grond">
      <LaunchBanner />
      <SiteHeader />

      {/* Hero — één zachte violette gloed */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
          <div
            className="absolute left-1/2 top-16 h-[520px] w-[920px] max-w-full -translate-x-1/2 rounded-full blur-[150px]"
            style={{ background: "radial-gradient(ellipse at center, rgba(124,58,237,0.12), transparent 70%)" }}
          />
        </div>

        <div className="mx-auto max-w-4xl px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-rand bg-kaart px-4 py-1.5 text-sm font-medium text-saldova-licht">
            {t("hero.badge")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl">{t("hero.title")}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">{t("hero.subtitle")}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register?type=zzp" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
              {t("hero.cta")}
            </Link>
            <DemoLoginButton variant="hero" label={t("hero.ctaDemo")} />
          </div>
          <div className="mt-4">
            <a href="#pricing" className="rounded text-sm font-medium text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">
              {t("hero.ctaSecondary")} →
            </a>
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
          <div className="animate-fade-in-up rounded-2xl border border-rand [mask-image:linear-gradient(to_bottom,black_82%,transparent)]">
            <MockDashboard variant="free" />
          </div>
        </div>

        <p className="mt-10 px-6 text-center text-sm text-slate-400">{t("hero.trust")}</p>
      </section>

      <TrustBar />

      {/* Product tour */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("tour.title")}</h2>
            <p className="mt-3 text-slate-400">{t("tour.subtitle")}</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {(["invoices", "time", "mileage"] as const).map((tool, i) => (
              <div key={tool} className="card-glass p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht">
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
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-rand bg-kaart px-3 py-1 text-xs font-medium text-saldova-licht">
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

      {/* Prijzen */}
      <section id="pricing" className="border-y border-rand bg-kaart/40 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("pricingSection.title")}</h2>
            <p className="mt-3 text-slate-400">{t("pricingSection.subtitle")}</p>
            <p className="mt-4 text-sm font-medium text-saldova-licht">{t("pricingSection.trial")}</p>
          </div>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-rand bg-grond px-6 py-4 text-center">
            <p className="text-sm text-slate-300">{t("pricingSection.anchor", { rate: ACCOUNTANT_HOURLY_EUR })}</p>
          </div>

          <div className="mt-12">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white">{tp("groupSolo.title")}</h3>
              <p className="text-sm text-slate-400">{tp("groupSolo.subtitle")}</p>
            </div>
            <PricingTable plans={FREELANCER_PLANS} cols="md:grid-cols-3" popularKey="PRO" accountType="zzp" />
          </div>

          <div className="mt-14 flex flex-col items-center justify-between gap-4 rounded-2xl border border-rand bg-grond px-6 py-6 text-center sm:flex-row sm:text-left">
            <div>
              <h3 className="text-lg font-bold text-white">{tp("groupBusiness.title")}</h3>
              <p className="text-sm text-slate-400">{tp("groupBusiness.subtitle")}</p>
            </div>
            <Link href="/bedrijven" className={cn(buttonClass("secondary"), "w-full shrink-0 sm:w-auto")}>
              {t("pricingSection.companyCta")} →
            </Link>
          </div>

          <GuaranteeBar />

          {/* Gratis startgesprek: opent het contactformulier met onderwerp "Startgesprek" */}
          <StartgesprekCta variant="row" className="mt-8" />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("faqSection.title")}</h2>
            <p className="mt-3 text-slate-400">{t("faqSection.subtitle")}</p>
          </div>
          <div className="mt-14"><Faq /></div>
          <div className="mt-8 text-center">
            <Link href="/faq" className="rounded text-sm font-semibold text-saldova-licht hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">
              {t("faqSection.viewAll")} →
            </Link>
          </div>
        </div>
      </section>

      {/* Slot-CTA — rustige kaart met witte knop */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-rand bg-kaart px-6 py-14 text-center sm:py-16">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("cta.title")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">{t(launched ? "cta.subtitleLaunched" : "cta.subtitle")}</p>
          <Link href="/register?type=zzp" className={cn(buttonClass("primary", "lg"), "mt-8 w-full sm:w-auto")}>
            {t("cta.button")}
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
