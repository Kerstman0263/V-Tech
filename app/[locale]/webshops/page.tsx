import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Faq } from "@/components/landing/Faq";
import { ConnectFlow } from "@/components/landing/ConnectFlow";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PLANS } from "@/lib/plans";
import { formatPlanPrice } from "@/lib/marketing";
import { buttonClass } from "@/components/ui/Button";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { isLaunched } from "@/lib/company";
import { ExportGuaranteeNote } from "@/components/landing/ExportGuaranteeNote";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "webshops");
}

// Mock "Koppelingen"-paneel voor de hero. Voorbeeldwaarden, geen echte data.
function ConnectionsVisual() {
  const t = useTranslations("webshops.visual");
  const shops = [
    { name: "Shopify", orders: "1.284", dot: "bg-emerald-400" },
    { name: "WooCommerce", orders: "312", dot: "bg-emerald-400" },
    { name: "Bol.com", orders: "86", dot: "bg-emerald-400" },
  ];
  const countries = [
    { c: "NL", rate: "21%", amt: "€ 18.420" },
    { c: "BE", rate: "21%", amt: "€ 4.115" },
    { c: "DE", rate: "19%", amt: "€ 2.980" },
    { c: "FR", rate: "20%", amt: "€ 640" },
  ];
  return (
    <div className="relative">
      <div className="relative rounded-3xl border border-rand bg-kaart p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] sm:p-6">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-bold text-white">{t("title")}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-beacon rounded-full bg-emerald-400" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span>
            {t("live")}
          </span>
        </div>
        <ul className="mt-5 space-y-2.5">
          {shops.map((s) => (
            <li key={s.name} className="flex items-center justify-between rounded-2xl border border-rand bg-grond px-4 py-3">
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht"><Icon name="store" className="h-4 w-4" /></span>
                <span>
                  <span className="block text-sm font-semibold text-white">{s.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400"><span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />{t("synced")}</span>
                </span>
              </span>
              <span className="text-right">
                <span className="block text-sm font-semibold tabular-nums text-white">{s.orders}</span>
                <span className="text-xs text-slate-400">{t("orders")}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-2xl border border-rand bg-black/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("perCountry")}</p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {countries.map((r) => (
                <tr key={r.c} className="border-t border-rand first:border-0">
                  <td className="py-2 font-semibold text-white">{r.c}</td>
                  <td className="py-2 text-slate-400">{t("vat")} {r.rate}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-white">{r.amt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Webshop-pagina: het e-commercepakket. Zelfde paarse identiteit als de home.
export default function WebshopsPage() {
  const t = useTranslations("webshops");
  const tp = useTranslations("pricing");
  const launched = isLaunched();
  const plan = PLANS.WEBSHOP;

  const pains: IconName[] = ["clock", "globe", "wallet"];
  const features: { key: string; icon: IconName }[] = [
    { key: "import", icon: "refresh" },
    { key: "daily", icon: "calendar" },
    { key: "oss", icon: "globe" },
    { key: "payouts", icon: "wallet" },
    { key: "fees", icon: "receipt" },
    { key: "returns", icon: "package" },
    { key: "b2b", icon: "invoice" },
    { key: "tax", icon: "piggy-bank" },
  ];
  const platforms = [
    { name: "Shopify", how: "api" },
    { name: "WooCommerce", how: "api" },
    { name: "Bol.com", how: "api" },
    { name: "Etsy", how: "csv" },
    { name: "Amazon", how: "csv" },
    { name: "Lightspeed", how: "csv" },
    { name: "Mollie", how: "csv" },
    { name: "PayPal", how: "csv" },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-grond text-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
          <div className="absolute right-[-10%] top-[-20%] h-[600px] w-[700px] rounded-full blur-[140px]" style={{ background: "radial-gradient(circle, rgba(124,58,237,0.12), transparent 70%)" }} />
        </div>
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-24 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-24">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-rand bg-kaart px-3.5 py-1.5 text-sm font-semibold text-saldova-licht">
              <Icon name="cart" className="h-4 w-4" />
              {t("hero.eyebrow")}
            </span>
            <h1 className="mt-7 font-display text-[2.6rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl">
              {t("hero.titleA")}{" "}
              <span className="text-saldova-licht">{t("hero.titleB")}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 lg:mx-0">{t("hero.subtitle")}</p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/register?type=webshop" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
                {t("hero.cta")}
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <a href="#how" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
                {t("hero.ctaSecondary")}
              </a>
            </div>
          </div>
          <ConnectionsVisual />
        </div>
      </section>

      {/* HERKENBAAR PROBLEEM */}
      <section className="border-y border-rand bg-grond px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div className="max-w-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-saldova-licht">{t("pains.eyebrow")}</p>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">{t("pains.title")}</h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">{t("pains.intro")}</p>
            </div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] border border-rand">
              <Image src="/images/webshop-inpakken.webp" alt={t("pains.photoAlt")} fill sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-kaart/70 via-transparent to-transparent" />
            </div>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {pains.map((icon, i) => (
              <div key={i} className="rounded-3xl border border-rand bg-kaart p-7">
                <Icon name={icon} className="h-6 w-6 text-rose-300" />
                <h3 className="mt-5 font-display text-xl font-bold">{t(`pains.items.${i}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t(`pains.items.${i}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FUNCTIES */}
      <section className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-saldova-licht">{t("features.eyebrow")}</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">{t("features.title")}</h2>
            <p className="mt-4 text-lg text-slate-400">{t("features.intro")}</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.key} className="rounded-2xl border border-rand bg-kaart p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht"><Icon name={f.icon} className="h-5 w-5" /></span>
                <h3 className="mt-5 font-semibold text-white">{t(`features.items.${f.key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(`features.items.${f.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORMS */}
      <section className="border-y border-rand bg-grond px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-saldova-licht">{t("platforms.eyebrow")}</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t("platforms.title")}</h2>
          </div>
          <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {platforms.map((p) => (
              <li key={p.name} className="flex flex-col items-center rounded-2xl border border-rand bg-kaart px-4 py-6 text-center">
                <span className="font-display text-lg font-bold text-white">{p.name}</span>
                <span className={cn("mt-2 rounded-full px-2.5 py-0.5 text-xs font-semibold", p.how === "api" ? "bg-emerald-500/10 text-emerald-300" : "border border-rand bg-grond text-slate-300")}>
                  {t(`platforms.${p.how}`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-sm text-slate-400">{t("platforms.note")}</p>
        </div>
      </section>

      {/* ZO WERKT HET */}
      <section id="how" className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-saldova-licht">{t("how.eyebrow")}</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t("how.title")}</h2>
          </div>
          <div className="mt-14">
            <ConnectFlow />
          </div>
        </div>
      </section>

      {/* PRIJS */}
      <section id="pricing" className="px-4 pb-24 sm:px-6">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-saldova-licht/30 bg-kaart lg:grid-cols-2">
          <div className="p-6 sm:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-saldova-licht">{t("pricing.eyebrow")}</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t("pricing.title")}</h2>
            <p className="mt-4 text-slate-300">{t("pricing.desc")}</p>
            <p className="mt-8 font-display text-6xl font-extrabold tabular-nums">{formatPlanPrice(plan.price)}</p>
            <p className="mt-1 text-slate-400">{t("pricing.perMonth")}</p>
            <Link href="/register?type=webshop" className={cn(buttonClass("primary", "lg"), "mt-8 w-full sm:w-auto")}>
              {t("pricing.cta")}
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            {!launched && <p className="mt-3 text-sm text-slate-400">{tp("launchNote")}</p>}
            <p className="mt-2 text-xs text-slate-400">{t("pricing.note")}</p>
            <ExportGuaranteeNote align="start" className="mt-4" />
            <p className="mt-6 text-xs leading-relaxed text-slate-400">{t("pricing.disclaimer")}</p>
          </div>
          <div className="border-t border-rand bg-grond p-6 sm:p-12 lg:border-l lg:border-t-0">
            <p className="font-semibold text-white">{t("pricing.includes")}</p>
            <ul className="mt-5 space-y-3">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <Icon name="check-circle" className="mt-0.5 h-4 w-4 text-saldova-licht" />
                  {t(`pricing.items.${i}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-rand px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t("faqTitle")}</h2>
          <div className="mt-10">
            <Faq namespace="webshops.faq" items={["platforms", "invoices", "oss", "accountant", "other"]} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
