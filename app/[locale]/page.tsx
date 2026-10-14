import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { IntegrationsMarquee } from "@/components/landing/IntegrationsMarquee";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { DemoLoginButton } from "@/components/auth/DemoLoginButton";
import { Faq } from "@/components/landing/Faq";
import { Icon, type IconName } from "@/components/ui/Icon";
import { pageMetadata } from "@/lib/seo";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "home");
}

// Kleine sectiekop: label + titel + intro. Links uitgelijnd op desktop voor
// meer ritme dan "alles gecentreerd".
function SectionHead({ eyebrow, title, intro, center = false }: { eyebrow: string; title: string; intro?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-300">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">{title}</h2>
      {intro && <p className="mt-4 text-lg leading-relaxed text-slate-400">{intro}</p>}
    </div>
  );
}

// Home — donkerpaarse Saldova-identiteit, nu met meer hiërarchie:
// asymmetrische hero, koppelingenband, routekeuze, bento-functies.
export default function HomePage() {
  const t = useTranslations("home");
  const tp = useTranslations("pricing");

  const routes: { key: "zzp" | "shop" | "team"; icon: IconName; href: "/zzp" | "/webshops" | "/bedrijven"; photo: string; isNew?: boolean }[] = [
    { key: "zzp", icon: "user", href: "/zzp", photo: "/images/zzp-laptop.webp" },
    { key: "shop", icon: "store", href: "/webshops", photo: "/images/webshop-pakket.webp", isNew: true },
    { key: "team", icon: "users", href: "/bedrijven", photo: "/images/team-overleg.webp" },
  ];

  const promises: { icon: IconName; key: string }[] = [
    { icon: "calendar", key: "cancel" },
    { icon: "heart", key: "free" },
    { icon: "check-circle", key: "rates" },
    { icon: "wallet", key: "pay" },
  ];

  const easy: { icon: IconName; key: string }[] = [
    { icon: "phone", key: "mobile" },
    { icon: "chat", key: "plain" },
    { icon: "users", key: "human" },
  ];

  const pricePlans = ["FREE", "PRO", "WEBSHOP"] as const;

  const security: { icon: IconName; key: string }[] = [
    { icon: "lock", key: "enc" },
    { icon: "globe", key: "eu" },
    { icon: "shield", key: "twofa" },
    { icon: "download", key: "export" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0618] text-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
          <div className="absolute left-[-10%] top-[-20%] h-[600px] w-[700px] rounded-full blur-[140px]" style={{ background: "radial-gradient(circle, rgba(124,58,237,0.30), transparent 70%)" }} />
          <div className="absolute right-[-10%] top-[20%] h-[500px] w-[600px] rounded-full blur-[140px]" style={{ background: "radial-gradient(circle, rgba(217,70,239,0.14), transparent 70%)" }} />
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 pb-24 pt-16 lg:grid-cols-[1fr_1.15fr] lg:gap-12 lg:pt-24">
          <div className="text-center lg:text-left">
            <Link
              href="/webshops"
              className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 text-sm text-slate-300 backdrop-blur transition-colors hover:border-brand-400/40 hover:text-white"
            >
              <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white">{t("newBadge")}</span>
              {t("pill")}
              <Icon name="arrow-right" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <h1 className="mt-7 font-display text-[2.6rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-[3.6rem]">
              {t("titleA")}{" "}
              <span className="bg-gradient-to-r from-brand-300 via-fuchsia-300 to-brand-400 bg-clip-text text-transparent">{t("titleB")}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 lg:mx-0">{t("subtitle")}</p>

            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-semibold text-[#0A0618] shadow-[0_8px_30px_-6px_rgba(168,85,247,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-50"
              >
                {t("ctaStart")}
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <DemoLoginButton variant="hero" label={t("ctaDemo")} />
            </div>

            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-400 lg:justify-start">
              {(["free", "eu", "fast"] as const).map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5">
                  <Icon name="check-circle" className="h-4 w-4 text-brand-300" />
                  {t(`heroTrust.${k}`)}
                </li>
              ))}
            </ul>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* EERLIJKE BELOFTES — wat je zeker weet voordat je begint */}
      <section className="border-t border-white/[0.06] px-6 py-10">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
          {promises.map((p) => (
            <li key={p.key} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-brand-300 ring-1 ring-white/10">
                <Icon name={p.icon} className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{t(`promises.${p.key}.title`)}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{t(`promises.${p.key}.desc`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <IntegrationsMarquee />

      {/* ROUTEKEUZE — zzp / webshop / team */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow={t("routes.eyebrow")} title={t("routes.title")} intro={t("routes.intro")} />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {routes.map((r) => (
              <Link
                key={r.key}
                href={r.href}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-3xl border p-7 transition-all duration-300 hover:-translate-y-1",
                  r.isNew
                    ? "border-brand-400/40 bg-gradient-to-b from-brand-600/20 to-[#120d2a] shadow-[0_0_60px_-20px_rgba(168,85,247,0.6)]"
                    : "border-white/[0.08] bg-[#120d2a] hover:border-white/20",
                )}
              >
                <div className="relative -mx-7 -mt-7 mb-6 aspect-[16/10] overflow-hidden">
                  <Image
                    src={r.photo}
                    alt={t(`routes.${r.key}.photoAlt`)}
                    fill
                    sizes="(min-width: 1024px) 400px, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#120d2a] via-[#120d2a]/20 to-transparent" />
                  <span className="absolute bottom-4 left-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#120d2a]/80 text-brand-200 ring-1 ring-white/15 backdrop-blur">
                    <Icon name={r.icon} className="h-6 w-6" />
                  </span>
                  {r.isNew && <span className="absolute right-5 top-5 rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white shadow-lg">{t("newBadge")}</span>}
                </div>
                <h3 className="font-display text-2xl font-bold text-white">{t(`routes.${r.key}.title`)}</h3>
                <p className="mt-2 text-slate-400">{t(`routes.${r.key}.desc`)}</p>
                <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Icon name="check" className="mt-0.5 h-4 w-4 text-brand-300" />
                      {t(`routes.${r.key}.points.${i}`)}
                    </li>
                  ))}
                </ul>
                <span className="mt-8 inline-flex items-center gap-2 pt-2 text-sm font-semibold text-brand-200 group-hover:text-white">
                  {t(`routes.${r.key}.cta`)}
                  <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* GEBRUIKSVRIENDELIJK — foto + drie beloftes over gemak */}
      <section className="px-6 pb-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/10">
              <Image src="/images/vakman-werkplaats.webp" alt={t("easy.photoAlt")} fill sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-[#0A0618]/60 via-transparent to-transparent" />
            </div>
            <div className="absolute -bottom-6 right-4 w-72 rounded-2xl border border-white/10 bg-[#120d2a]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur sm:right-8">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/20"><Icon name="send" className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{t("easy.cardTitle")}</p>
                  <p className="text-xs text-slate-400">{t("easy.cardMeta")}</p>
                </div>
              </div>
            </div>
          </div>
          <div>
            <SectionHead eyebrow={t("easy.eyebrow")} title={t("easy.title")} intro={t("easy.intro")} />
            <ul className="mt-10 space-y-6">
              {easy.map((e) => (
                <li key={e.key} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200 ring-1 ring-brand-400/20"><Icon name={e.icon} className="h-5 w-5" /></span>
                  <span>
                    <span className="block font-semibold text-white">{t(`easy.items.${e.key}.title`)}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-400">{t(`easy.items.${e.key}.desc`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* BENTO — de belangrijkste functies, elk met een mini-visual */}
      <section id="features" className="border-t border-white/[0.06] bg-[#0d0a1f] px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow={t("bento.eyebrow")} title={t("bento.title")} intro={t("bento.intro")} />

          <div className="mt-12 grid auto-rows-[minmax(0,auto)] gap-5 md:grid-cols-2 lg:grid-cols-3">
            {/* Groot: Fiscale Rust */}
            <article className="relative flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#1a1140] to-[#110c26] p-7 md:col-span-2 lg:row-span-2">
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative flex flex-1 flex-col">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/20 text-brand-200"><Icon name="piggy-bank" className="h-5 w-5" /></span>
                <h3 className="mt-5 font-display text-2xl font-bold">{t("bento.tax.title")}</h3>
                <p className="mt-2 max-w-md text-slate-400">{t("bento.tax.desc")}</p>

                <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
                  {([
                    { k: "vat", amount: "€ 1.815", w: "w-[56%]", c: "from-brand-500 to-brand-400" },
                    { k: "ib", amount: "€ 1.120", w: "w-[35%]", c: "from-fuchsia-500 to-fuchsia-400" },
                    { k: "zvw", amount: "€ 305", w: "w-[9%]", c: "from-sky-500 to-sky-400" },
                  ] as const).map((row) => (
                    <div key={row.k} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{t(`bento.tax.${row.k}`)}</span>
                        <span className="font-semibold tabular-nums text-white">{row.amount}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className={cn("h-full rounded-full bg-gradient-to-r", row.w, row.c)} />
                      </div>
                    </div>
                  ))}
                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                    <span className="text-sm text-slate-400">{t("bento.tax.total")}</span>
                    <span className="font-display text-2xl font-extrabold text-white">€ 3.240</span>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-6">
                  {(["chip1", "chip2", "chip3"] as const).map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
                      <Icon name="check" className="h-3 w-3 text-brand-300" /> {t(`bento.tax.${c}`)}
                    </span>
                  ))}
                </div>
              </div>
            </article>

            {/* Facturen */}
            <article className="rounded-3xl border border-white/[0.08] bg-[#120d2a] p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200"><Icon name="invoice" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.invoice.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("bento.invoice.desc")}</p>
              <div className="mt-6 space-y-2">
                {[
                  ["2026-0012", "€ 1.210", "bg-emerald-400"],
                  ["2026-0011", "€ 605", "bg-amber-400"],
                ].map(([nr, amt, dot]) => (
                  <div key={nr} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-slate-300"><span className={cn("h-2 w-2 rounded-full", dot)} />{nr}</span>
                    <span className="font-semibold tabular-nums">{amt}</span>
                  </div>
                ))}
              </div>
            </article>

            {/* Urencriterium */}
            <article className="rounded-3xl border border-white/[0.08] bg-[#120d2a] p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200"><Icon name="clock" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.hours.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("bento.hours.desc")}</p>
              <div className="mt-6">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-display text-2xl font-extrabold tabular-nums">912 u</span>
                  <span className="text-slate-500">/ 1225 u</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full w-[74%] rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400" />
                </div>
              </div>
            </article>

            {/* Scan & betaal */}
            <article className="flex gap-5 rounded-3xl border border-white/[0.08] bg-[#120d2a] p-7">
              <div className="min-w-0 flex-1">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200"><Icon name="qr" className="h-5 w-5" /></span>
                <h3 className="mt-5 font-display text-xl font-bold">{t("bento.qr.title")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("bento.qr.desc")}</p>
              </div>
            </article>

            {/* Vandaag doen */}
            <article className="rounded-3xl border border-white/[0.08] bg-[#120d2a] p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200"><Icon name="sun" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.today.title")}</h3>
              <ul className="mt-5 space-y-2.5 text-sm">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-start gap-2.5 text-slate-300">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", i === 0 ? "bg-rose-400" : i === 1 ? "bg-amber-400" : "bg-brand-400")} />
                    {t(`bento.today.items.${i}`)}
                  </li>
                ))}
              </ul>
            </article>

            {/* E-factuur + overstappen */}
            <article className="rounded-3xl border border-white/[0.08] bg-[#120d2a] p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200"><Icon name="refresh" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.switch.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("bento.switch.desc")}</p>
            </article>
          </div>
        </div>
      </section>

      {/* PRODUCT-SHOWCASE — klikbare tabs */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionHead center eyebrow={t("showcaseTag")} title={t("showcaseTitle")} intro={t("showcaseSubtitle")} />
          <div className="mt-12">
            <ProductShowcase />
          </div>
        </div>
      </section>

      {/* ZO WERKT HET */}
      <section className="border-y border-white/[0.06] bg-[#0d0a1f] px-6 py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <SectionHead eyebrow={t("stepsEyebrow")} title={t("stepsTitle")} intro={t("stepsSubtitle")} />
          <ol className="space-y-4">
            {(["account", "work", "rest"] as const).map((key, i) => (
              <li key={key} className="flex gap-5 rounded-2xl border border-white/[0.08] bg-[#120d2a] p-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-lg font-extrabold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold text-white">{t(`steps.${key}.title`)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{t(`steps.${key}.desc`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* VEILIGHEID */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHead center eyebrow={t("security.eyebrow")} title={t("security.title")} intro={t("security.intro")} />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {security.map((s) => (
              <div key={s.key} className="rounded-2xl border border-white/[0.08] bg-[#120d2a] p-6">
                <Icon name={s.icon} className="h-6 w-6 text-brand-300" />
                <h3 className="mt-4 font-semibold text-white">{t(`security.items.${s.key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(`security.items.${s.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRIJZEN — transparant, direct op de homepage */}
      <section className="border-t border-white/[0.06] bg-[#0d0a1f] px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHead center eyebrow={t("prices.eyebrow")} title={t("prices.title")} intro={t("prices.intro")} />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {pricePlans.map((id) => {
              const plan = PLANS[id];
              const featured = id === "PRO";
              return (
                <div
                  key={id}
                  className={cn(
                    "relative flex flex-col rounded-3xl border p-7",
                    featured ? "border-brand-400/50 bg-gradient-to-b from-brand-600/20 to-[#120d2a] shadow-[0_0_60px_-20px_rgba(168,85,247,0.6)]" : "border-white/[0.08] bg-[#120d2a]",
                  )}
                >
                  {featured && <span className="absolute -top-3 left-7 rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white">{tp("mostPopular")}</span>}
                  <p className="font-display text-xl font-bold text-white">{tp(`plans.${plan.key}.name`)}</p>
                  <p className="mt-1 text-sm text-slate-400">{tp(`plans.${plan.key}.tagline`)}</p>
                  <p className="mt-6 flex items-end gap-1.5">
                    <span className="font-display text-5xl font-extrabold text-white">€{plan.price}</span>
                    <span className="pb-1.5 text-sm text-slate-400">{t("prices.perMonth")}</span>
                  </p>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-300">{tp(`plans.${plan.key}.desc`)}</p>
                  <Link
                    href={id === "WEBSHOP" ? "/webshops" : "/register"}
                    className={cn(
                      "mt-7 rounded-xl px-5 py-3 text-center text-sm font-semibold transition-all",
                      featured ? "bg-white text-[#0A0618] hover:bg-brand-50" : "border border-white/15 bg-white/[0.04] text-white hover:bg-white/10",
                    )}
                  >
                    {id === "FREE" ? t("prices.ctaFree") : id === "WEBSHOP" ? t("prices.ctaShop") : t("prices.ctaPaid")}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-sm text-slate-400">
            {t("prices.note")}{" "}
            <Link href="/zzp#pricing" className="font-semibold text-brand-300 underline-offset-4 hover:text-white hover:underline">{t("prices.compare")}</Link>
          </p>
        </div>
      </section>

      {/* FAQ — de belangrijkste twijfels weggenomen */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <SectionHead center eyebrow={t("faqEyebrow")} title={t("faqTitle")} />
          <div className="mt-10">
            <Faq />
          </div>
          <p className="mt-6 text-center text-sm text-slate-400">
            {t("faqMore")}{" "}
            <Link href="/contact" className="font-semibold text-brand-300 underline-offset-4 hover:text-white hover:underline">{t("faqContact")}</Link>
          </p>
        </div>
      </section>

      {/* SLOT-CTA */}
      <section className="px-6 pb-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-brand-400/30 bg-gradient-to-br from-brand-700 via-[#3b1a8a] to-[#1a1140] px-6 py-20 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-faint opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tight sm:text-5xl">{t("ctaTitle")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100/80">{t("ctaSubtitle")}</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-semibold text-[#0A0618] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-50">
                {t("ctaButton")}
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <Link href="/zzp#pricing" className="rounded-xl border border-white/25 bg-white/10 px-7 py-3.5 font-semibold text-white backdrop-blur transition-colors duration-200 hover:bg-white/20">
                {t("ctaPricing")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
