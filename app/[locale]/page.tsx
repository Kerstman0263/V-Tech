import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ProductJourney } from "@/components/landing/ProductJourney";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { IntegrationsMarquee } from "@/components/landing/IntegrationsMarquee";
import { OvaBundles } from "@/components/landing/OvaBundles";
import { Faq } from "@/components/landing/Faq";
import { buttonClass } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatPlanPrice } from "@/lib/marketing";
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
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-saldova-licht">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">{title}</h2>
      {intro && <p className="mt-4 text-lg leading-relaxed text-slate-400">{intro}</p>}
    </div>
  );
}

/** Decoratief QR-blokje (geen echte code) voor de kaart "Scan & betaal". */
function QrSample() {
  // 9x9 vast patroon met de drie hoekmarkeringen van een QR-code.
  const cells = [
    "111101111",
    "100101001",
    "101101101",
    "111100111",
    "000011010",
    "111101011",
    "100100110",
    "101110101",
    "111101011",
  ];
  return (
    <svg viewBox="0 0 9 9" className="h-20 w-20 rounded-lg bg-white p-1.5" aria-hidden shapeRendering="crispEdges">
      {cells.flatMap((row, y) =>
        row.split("").map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0b0f14" /> : null)),
      )}
    </svg>
  );
}

// Home in de Ova-huisstijl: donkere grond, rustige kaarten, witte primaire knoppen.
export default function HomePage() {
  const t = useTranslations("home");
  const tp = useTranslations("pricing");

  const routes: { key: "zzp" | "shop" | "team"; icon: IconName; href: "/zzp" | "/webshops" | "/bedrijven"; photo: string }[] = [
    { key: "zzp", icon: "user", href: "/zzp", photo: "/images/zzp-laptop.webp" },
    { key: "shop", icon: "store", href: "/webshops", photo: "/images/webshop-pakket.webp" },
    { key: "team", icon: "users", href: "/bedrijven", photo: "/images/team-overleg.webp" },
  ];

  const promises: { icon: IconName; key: string }[] = [
    { icon: "calendar", key: "cancel" },
    { icon: "heart", key: "free" },
    { icon: "check-circle", key: "rates" },
    { icon: "wallet", key: "pay" },
  ];

  const pricePlans = ["FREE", "PRO", "WEBSHOP"] as const;

  const security: { icon: IconName; key: string }[] = [
    { icon: "lock", key: "enc" },
    { icon: "globe", key: "eu" },
    { icon: "shield", key: "twofa" },
    { icon: "download", key: "export" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-grond text-white">
      <SiteHeader />

      {/* HERO — één zachte violette gloed */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
          <div className="absolute left-[-10%] top-[-20%] h-[600px] w-[700px] max-w-full rounded-full blur-[140px]" style={{ background: "radial-gradient(circle, rgba(124,58,237,0.12), transparent 70%)" }} />
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1fr_1.15fr] lg:gap-12 lg:pt-24">
          <div className="text-center lg:text-left">
            <Link
              href="/webshops"
              className="group inline-flex items-center gap-2 rounded-full border border-rand bg-kaart px-3.5 py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saldova-licht"
            >
              {t("pill")}
              <Icon name="arrow-right" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <h1 className="mt-5 font-display text-[2.25rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-[3.6rem]">
              {t("titleA")} <span className="text-slate-300">{t("titleB")}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg lg:mx-0">{t("subtitle")}</p>

            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
              <Link href="/register" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
                {t("ctaStart")}
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <a href="#journey-title" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
                {t("ctaDemo")}
              </a>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-saldova-licht underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht"
              >
                {t("ctaDemoLink")} <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-400 lg:justify-start">
              {(["free", "eu", "fast"] as const).map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5">
                  <Icon name="check-circle" className="h-4 w-4 text-saldova-licht" />
                  {t(`heroTrust.${k}`)}
                </li>
              ))}
            </ul>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* EERLIJKE BELOFTES — wat je zeker weet voordat je begint */}
      <section className="border-t border-rand px-4 py-10 sm:px-6">
        <ul className="mx-auto grid max-w-7xl grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {promises.map((p) => (
            <li key={p.key} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rand bg-kaart text-saldova-licht">
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

      <ProductJourney />

      {/* ROUTEKEUZE — zzp / webshop / team */}
      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow={t("routes.eyebrow")} title={t("routes.title")} intro={t("routes.intro")} />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {routes.map((r) => (
              <Link
                key={r.key}
                href={r.href}
                className="saldova-premium-card group relative flex flex-col overflow-hidden rounded-3xl border border-rand bg-kaart p-6 transition-all duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saldova-licht sm:p-7"
              >
                <div className="relative -mx-6 -mt-6 mb-6 aspect-[16/10] overflow-hidden sm:-mx-7 sm:-mt-7">
                  <Image
                    src={r.photo}
                    alt={t(`routes.${r.key}.photoAlt`)}
                    fill
                    sizes="(min-width: 1024px) 400px, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-kaart via-kaart/20 to-transparent" />
                  <span className="absolute bottom-4 left-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-rand bg-kaart text-saldova-licht sm:left-7">
                    <Icon name={r.icon} className="h-6 w-6" />
                  </span>
                </div>
                <h3 className="font-display text-2xl font-bold text-white">{t(`routes.${r.key}.title`)}</h3>
                <p className="mt-2 text-slate-400">{t(`routes.${r.key}.desc`)}</p>
                <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-saldova-licht" />
                      {t(`routes.${r.key}.points.${i}`)}
                    </li>
                  ))}
                </ul>
                <span className="mt-8 inline-flex items-center gap-2 pt-2 text-sm font-semibold text-saldova-licht group-hover:text-white">
                  {t(`routes.${r.key}.cta`)}
                  <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* BENTO — de belangrijkste functies, elk met een mini-visual */}
      <section id="features" className="border-t border-rand px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow={t("bento.eyebrow")} title={t("bento.title")} intro={t("bento.intro")} />

          <div className="mt-12 grid auto-rows-[minmax(0,auto)] gap-5 md:grid-cols-2 lg:grid-cols-3">
            {/* Groot: Fiscale Rust */}
            <article className="saldova-premium-card relative flex flex-col overflow-hidden rounded-3xl border border-rand bg-kaart p-6 sm:p-7 md:col-span-2 lg:row-span-2">
              <div className="relative flex flex-1 flex-col">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht"><Icon name="piggy-bank" className="h-5 w-5" /></span>
                <h3 className="mt-5 font-display text-2xl font-bold">{t("bento.tax.title")}</h3>
                <p className="mt-2 max-w-md text-slate-400">{t("bento.tax.desc")}</p>

                <div className="mt-8 rounded-2xl border border-rand bg-grond p-5">
                  {([
                    { k: "vat", amount: "€ 1.815", w: "w-[56%]", c: "bg-saldova" },
                    { k: "ib", amount: "€ 1.120", w: "w-[35%]", c: "bg-saldova-licht" },
                    { k: "zvw", amount: "€ 305", w: "w-[9%]", c: "bg-slate-400" },
                  ] as const).map((row) => (
                    <div key={row.k} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{t(`bento.tax.${row.k}`)}</span>
                        <span className="font-semibold tabular-nums text-white">{row.amount}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className={cn("h-full rounded-full", row.w, row.c)} />
                      </div>
                    </div>
                  ))}
                  <div className="mt-5 flex items-center justify-between border-t border-rand pt-4">
                    <span className="text-sm text-slate-400">{t("bento.tax.total")}</span>
                    <span className="font-display text-2xl font-extrabold text-white">€ 3.240</span>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-6">
                  {(["chip1", "chip2", "chip3"] as const).map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-rand bg-grond px-3 py-1 text-xs font-medium text-slate-300">
                      <Icon name="check" className="h-3 w-3 text-saldova-licht" /> {t(`bento.tax.${c}`)}
                    </span>
                  ))}
                </div>
              </div>
            </article>

            {/* Facturen */}
            <article className="saldova-premium-card rounded-3xl border border-rand bg-kaart p-6 sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht"><Icon name="invoice" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.invoice.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("bento.invoice.desc")}</p>
              <div className="mt-6 space-y-2">
                {[
                  ["2026-0012", "€ 1.210", "bg-emerald-400"],
                  ["2026-0011", "€ 605", "bg-amber-400"],
                ].map(([nr, amt, dot]) => (
                  <div key={nr} className="flex items-center justify-between rounded-xl border border-rand bg-grond px-3.5 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-slate-300"><span className={cn("h-2 w-2 rounded-full", dot)} />{nr}</span>
                    <span className="font-semibold tabular-nums">{amt}</span>
                  </div>
                ))}
              </div>
            </article>

            {/* Urencriterium */}
            <article className="saldova-premium-card rounded-3xl border border-rand bg-kaart p-6 sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht"><Icon name="clock" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.hours.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("bento.hours.desc")}</p>
              <div className="mt-6">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-display text-2xl font-extrabold tabular-nums">912 u</span>
                  <span className="text-slate-400">/ 1225 u</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full w-[74%] rounded-full bg-saldova" />
                </div>
              </div>
            </article>

            {/* Scan & betaal — met een klein voorbeeld van de betaal-QR */}
            <article className="saldova-premium-card rounded-3xl border border-rand bg-kaart p-6 sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht"><Icon name="qr" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.qr.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("bento.qr.desc")}</p>
              <div className="mt-6 flex items-center gap-4 rounded-2xl border border-rand bg-grond p-3.5">
                <QrSample />
                <div className="min-w-0 text-sm">
                  <p className="text-slate-400">{t("bento.qr.example.invoice")}</p>
                  <p className="mt-0.5 font-display text-2xl font-extrabold tabular-nums text-white">€ 1.210</p>
                  <p className="mt-1 text-xs text-slate-400">{t("bento.qr.example.scan")}</p>
                </div>
              </div>
            </article>

            {/* Vandaag doen */}
            <article className="saldova-premium-card rounded-3xl border border-rand bg-kaart p-6 sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht"><Icon name="sun" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.today.title")}</h3>
              <ul className="mt-5 space-y-2.5 text-sm">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-start gap-2.5 text-slate-300">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", i === 0 ? "bg-rose-400" : i === 1 ? "bg-amber-400" : "bg-saldova-licht")} />
                    {t(`bento.today.items.${i}`)}
                  </li>
                ))}
              </ul>
            </article>

            {/* Overstappen */}
            <article className="saldova-premium-card rounded-3xl border border-rand bg-kaart p-6 sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht"><Icon name="refresh" className="h-5 w-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{t("bento.switch.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("bento.switch.desc")}</p>
              <Link href="/overstappen" className="mt-5 inline-flex rounded text-sm font-semibold text-saldova-licht underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">
                {t("bento.switch.cta")} →
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* VEILIGHEID */}
      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHead center eyebrow={t("security.eyebrow")} title={t("security.title")} intro={t("security.intro")} />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {security.map((s) => (
              <div key={s.key} className="rounded-2xl border border-rand bg-kaart p-6">
                <Icon name={s.icon} className="h-6 w-6 text-saldova-licht" />
                <h3 className="mt-4 font-semibold text-white">{t(`security.items.${s.key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(`security.items.${s.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRIJZEN — transparant, direct op de homepage, met de Ova-bundels */}
      <section id="prijzen" className="border-t border-rand px-4 pt-16 sm:px-6 sm:pt-24">
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
                    "relative flex flex-col rounded-3xl border bg-kaart p-6 sm:p-7",
                    featured ? "border-saldova-licht/50" : "border-rand",
                  )}
                >
                  {featured && <span className="absolute -top-3 left-6 rounded-full bg-saldova px-3 py-1 text-xs font-bold text-white sm:left-7">{tp("mostPopular")}</span>}
                  <p className="font-display text-xl font-bold text-white">{tp(`plans.${plan.key}.name`)}</p>
                  <p className="mt-1 text-sm text-slate-400">{tp(`plans.${plan.key}.tagline`)}</p>
                  <p className="mt-6 font-display text-5xl font-extrabold tabular-nums text-white">{formatPlanPrice(plan.price)}</p>
                  <p className="mt-1 text-sm text-slate-400">{t("prices.perMonth")}</p>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-300">{tp(`plans.${plan.key}.desc`)}</p>
                  <Link
                    href={id === "WEBSHOP" ? "/webshops" : "/register?type=zzp"}
                    className={cn(buttonClass(featured ? "primary" : "secondary", "lg"), "mt-7 w-full")}
                  >
                    {id === "FREE" ? t("prices.ctaFree") : id === "WEBSHOP" ? t("prices.ctaShop") : t("prices.ctaPaid")}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-400">{tp("launchNote")}</p>
          <p className="mt-3 text-center text-sm text-slate-400">
            {t("prices.note")}{" "}
            <Link href="/zzp#pricing" className="rounded font-semibold text-saldova-licht underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">
              {t("prices.compare")}
            </Link>
          </p>
        </div>
        <OvaBundles className="mt-6" />
      </section>

      {/* FAQ — de belangrijkste twijfels weggenomen */}
      <section className="border-t border-rand px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <SectionHead center eyebrow={t("faqEyebrow")} title={t("faqTitle")} />
          <div className="mt-10">
            <Faq />
          </div>
          <p className="mt-6 text-center text-sm text-slate-400">
            {t("faqMore")}{" "}
            <Link href="/contact" className="rounded font-semibold text-saldova-licht underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">
              {t("faqContact")}
            </Link>
          </p>
        </div>
      </section>

      {/* SLOT-CTA — rustige kaart met witte knop */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-3xl border border-rand bg-kaart px-6 py-14 text-center sm:py-20">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tight sm:text-5xl">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">{t("ctaSubtitle")}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
              {t("ctaButton")}
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link href="/zzp#pricing" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
              {t("ctaPricing")}
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
