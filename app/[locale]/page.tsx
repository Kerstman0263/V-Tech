import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { MockDashboard } from "@/components/landing/MockDashboard";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { AudienceSwitch } from "@/components/landing/AudienceSwitch";
import { DemoLoginButton } from "@/components/auth/DemoLoginButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "home");
}

// Home — diep, rijk paars premium thema (#0A0618). Product centraal, concrete
// waarde, vertrouwen. Electric-purple accenten met subtiele gloed.
export default function HomePage() {
  const t = useTranslations("home");

  const badges: { icon: IconName; key: string }[] = [
    { icon: "lock", key: "enc" },
    { icon: "shield", key: "eu" },
    { icon: "download", key: "export" },
    { icon: "wallet", key: "pay" },
  ];
  const pillars: { icon: IconName; key: string }[] = [
    { icon: "receipt", key: "facturatie" },
    { icon: "clock", key: "uren" },
    { icon: "piggy-bank", key: "buffer" },
    { icon: "users", key: "team" },
    { icon: "zap", key: "qr" },
    { icon: "invoice", key: "efactuur" },
    { icon: "download", key: "overstappen" },
    { icon: "check-circle", key: "vandaag" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0618] text-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Zachte paarse gloedbollen achter de tekst */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-8rem] h-[540px] w-[900px] max-w-[130%] -translate-x-1/2 rounded-full blur-[130px]" style={{ background: "radial-gradient(ellipse at center, rgba(124,58,237,0.28), rgba(147,51,234,0.10) 45%, transparent 72%)" }} />
          <div className="absolute right-[8%] top-[30%] h-72 w-72 rounded-full blur-[120px]" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.16), transparent 70%)" }} />
        </div>

        <div className="mx-auto max-w-3xl px-6 pb-6 pt-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#a855f7]/30 bg-brand-500/10 px-4 py-1.5 text-sm font-semibold text-brand-200">
            <Icon name="zap" className="h-4 w-4 text-brand-300" />
            {t("pill")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-[3.25rem]">
            <span className="bg-gradient-to-br from-white via-white to-brand-400 bg-clip-text text-transparent">{t("title")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#c4b5fd]">{t("subtitle")}</p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <DemoLoginButton variant="hero" solid label={t("ctaDemo")} />
            <a
              href="#pillars"
              className="rounded-xl border border-white/10 bg-white/[0.05] px-7 py-3.5 font-semibold text-white backdrop-blur transition-colors duration-200 hover:bg-white/10"
            >
              {t("ctaFeatures")}
            </a>
          </div>

          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-[#c4b5fd]">
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-brand-300" />{t("heroTrust.free")}</span>
            <span className="text-brand-300/40">·</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-brand-300" />{t("heroTrust.eu")}</span>
            <span className="text-brand-300/40">·</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-brand-300" />{t("heroTrust.fast")}</span>
          </p>
        </div>

        {/* Dashboard-preview — neon paarse rand, spat van het scherm af */}
        <div className="relative mx-auto max-w-5xl px-6 pb-4">
          <div aria-hidden className="pointer-events-none absolute -top-6 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full bg-brand-600/25 blur-[110px]" />
          <div className="relative overflow-hidden rounded-2xl border border-[#7C3AED] shadow-[0_0_50px_-8px_rgba(124,58,237,0.45)]">
            <MockDashboard variant="free" />
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
            {badges.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-2 rounded-full border border-[#a855f7]/20 bg-[#16102E] px-4 py-2 text-sm font-medium text-slate-200">
                <Icon name={b.icon} className="h-4 w-4 text-brand-300" />
                {t(`badges.${b.key}`)}
              </span>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl rounded-2xl border border-[#a855f7]/20 bg-[#16102E] px-5 py-3 text-center text-sm text-[#c4b5fd]">
            <Icon name="briefcase" className="mr-1.5 inline h-4 w-4 align-[-3px] text-brand-300" />
            {t("experience")}
          </p>
        </div>
      </section>

      {/* ZO WERKT HET — 3 stappen, in mensentaal */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("stepsTitle")}</h2>
            <p className="mt-3 text-[#c4b5fd]">{t("stepsSubtitle")}</p>
          </div>
          <div className="relative mt-14 grid gap-6 md:grid-cols-3">
            {/* Verbindingslijn op desktop */}
            <div aria-hidden className="pointer-events-none absolute inset-x-[16%] top-7 hidden h-px bg-gradient-to-r from-brand-500/40 via-brand-500/40 to-transparent md:block" />
            {(["account", "work", "rest"] as const).map((key, i) => (
              <div key={key} className="relative text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#a855f7]/30 bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-extrabold text-white shadow-[0_0_24px_rgba(124,58,237,0.4)]">
                  {i + 1}
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">{t(`steps.${key}.title`)}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[#c4b5fd]">{t(`steps.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCT-SHOWCASE — klikbare tabs, geen statische plaatjes */}
      <section className="border-y border-white/[0.06] bg-[#0F0C20] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#a855f7]/30 bg-brand-500/10 px-4 py-1.5 text-sm font-semibold text-brand-200">
              <Icon name="zap" className="h-4 w-4 text-brand-300" />
              {t("showcaseTag")}
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("showcaseTitle")}</h2>
            <p className="mt-3 text-[#c4b5fd]">{t("showcaseSubtitle")}</p>
          </div>
          <div className="mt-12">
            <ProductShowcase />
          </div>

          {/* Windows-app strip — verwijst naar de publieke /windows-pagina */}
          <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center justify-between gap-4 rounded-2xl border border-[#a855f7]/20 bg-[#16102E] px-6 py-5 sm:flex-row">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-[#a855f7]/20">
                <Icon name="monitor" className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold text-white">{t("windowsBanner.title")}</p>
                <p className="mt-0.5 text-sm text-[#c4b5fd]">{t("windowsBanner.desc")}</p>
              </div>
            </div>
            <Link
              href="/windows"
              className="shrink-0 rounded-xl border border-[#a855f7]/30 bg-brand-500/10 px-5 py-2.5 text-sm font-semibold text-brand-200 transition-colors duration-200 hover:bg-brand-500/20 hover:text-white"
            >
              {t("windowsBanner.cta")}
            </Link>
          </div>
        </div>
      </section>

      {/* DUBBELE DOELGROEP SWITCH */}
      <section className="relative overflow-hidden border-y border-white/[0.06] bg-[#0F0C20] px-6 py-20">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-64 w-3/4 -translate-x-1/2 rounded-full bg-brand-600/10 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("switch.title")}</h2>
            <p className="mt-3 text-[#c4b5fd]">{t("switch.subtitle")}</p>
          </div>
          <div className="mt-10">
            <AudienceSwitch />
          </div>
        </div>
      </section>

      {/* GEMAAKT VOOR ONDERNEMERS ZOALS JIJ — persona's met foto-plekken */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("personasTitle")}</h2>
            <p className="mt-3 text-[#c4b5fd]">{t("personasSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {([
              { key: "designer", icon: "star" as IconName, grad: "from-brand-500 to-fuchsia-500" },
              { key: "builder", icon: "car" as IconName, grad: "from-sky-500 to-brand-500" },
              { key: "shop", icon: "building" as IconName, grad: "from-emerald-500 to-teal-500" },
            ] as const).map((p) => (
              <div key={p.key} className="rounded-3xl border border-[#a855f7]/20 bg-[#16102E] p-6">
                <div className="flex items-center gap-4">
                  {/* Foto-plek — klaar voor een echte foto later; nu een nette gradient-illustratie */}
                  <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${p.grad} text-white ring-2 ring-white/10`}>
                    <Icon name={p.icon} className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-bold text-white">{t(`personas.${p.key}.name`)}</p>
                    <p className="text-xs text-brand-300">{t(`personas.${p.key}.tag`)}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-[#c4b5fd]">{t(`personas.${p.key}.line`)}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">{t("personasNote")}</p>
        </div>
      </section>

      {/* PRODUCT PILLAREN */}
      <section id="pillars" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("pillarsTitle")}</h2>
            <p className="mt-3 text-[#c4b5fd]">{t("pillarsSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map((p) => (
              <div
                key={p.key}
                className="group rounded-2xl border border-[#a855f7]/20 bg-[#16102E] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#a855f7]/40 hover:shadow-[0_0_30px_-10px_rgba(124,58,237,0.4)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-[#a855f7]/20">
                  <Icon name={p.icon} className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-bold text-white">{t(`pillars.${p.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#c4b5fd]">{t(`pillars.${p.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-6 pb-24">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-[#a855f7]/30 bg-gradient-to-br from-[#1a1140] to-[#0d0a20] px-6 py-16 text-center shadow-[0_0_60px_-16px_rgba(124,58,237,0.5)]">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-[#9333EA]/15 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("ctaTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-[#c4b5fd]">{t("ctaSubtitle")}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] transition-all duration-200 hover:bg-brand-500 hover:shadow-[0_0_28px_rgba(124,58,237,0.55)]">
                {t("ctaButton")}
              </Link>
              <Link href="/zzp" className="rounded-xl border border-white/15 bg-white/[0.05] px-7 py-3.5 font-semibold text-white backdrop-blur transition-colors duration-200 hover:bg-white/10">
                {t("ctaFeatures")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
