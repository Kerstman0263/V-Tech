import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Icon, type IconName } from "@/components/ui/Icon";
import { DESKTOP_VERSION } from "@/lib/desktop";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "windows");
}

/**
 * Publieke marketingpagina voor de Windows-app (saldova.nl/windows).
 * De download zelf blijft achter login + betaald plan (pagina /desktop in de
 * tool) — deze pagina verkoopt de app en wijst de weg. De installer is bewust
 * alleen een launcher: de tool zelf draait in de cloud en zit niet in het
 * bestand, dus er valt niets te kopiëren.
 */
export default function WindowsPage() {
  const t = useTranslations("desktop.site");
  const tf = useTranslations("desktop.page.features");
  const ts = useTranslations("showcase");

  const features: { icon: IconName; key: string }[] = [
    { icon: "monitor", key: "window" },
    { icon: "zap", key: "fast" },
    { icon: "shield", key: "same" },
    { icon: "lock", key: "secure" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0618] text-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute left-1/2 top-[-8rem] h-[500px] w-[860px] max-w-[130%] -translate-x-1/2 rounded-full blur-[130px]"
            style={{ background: "radial-gradient(ellipse at center, rgba(124,58,237,0.28), rgba(147,51,234,0.10) 45%, transparent 72%)" }}
          />
        </div>

        <div className="mx-auto max-w-3xl px-6 pb-10 pt-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#a855f7]/30 bg-brand-500/10 px-4 py-1.5 text-sm font-semibold text-brand-200">
            <Icon name="monitor" className="h-4 w-4 text-brand-300" />
            {t("pill")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-[3.25rem]">
            <span className="bg-gradient-to-br from-white via-white to-brand-400 bg-clip-text text-transparent">{t("title")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#c4b5fd]">{t("subtitle")}</p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] transition-all duration-200 hover:bg-brand-500 hover:shadow-[0_0_28px_rgba(124,58,237,0.55)]"
            >
              {t("ctaLogin")}
            </Link>
            <Link
              href="/zzp#pricing"
              className="rounded-xl border border-white/10 bg-white/[0.05] px-7 py-3.5 font-semibold text-white backdrop-blur transition-colors duration-200 hover:bg-white/10"
            >
              {t("ctaPlans")}
            </Link>
          </div>

          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-[#c4b5fd]">
            <span className="inline-flex items-center gap-1.5"><Icon name="star" className="h-3.5 w-3.5 text-brand-300" />{t("trust.paid")}</span>
            <span className="text-brand-300/40">·</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-brand-300" />{t("trust.freeWeb")}</span>
            <span className="text-brand-300/40">·</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-brand-300" />{t("trust.requirements")}</span>
          </p>
        </div>

        {/* WINDOWS-VENSTER MOCK — de app als echt venster op je bureaublad */}
        <div className="relative mx-auto max-w-4xl px-6 pb-4">
          <div aria-hidden className="pointer-events-none absolute -top-6 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full bg-brand-600/25 blur-[110px]" />
          <div className="relative overflow-hidden rounded-2xl border border-[#7C3AED]/70 bg-[#0d0a20] shadow-[0_0_50px_-8px_rgba(124,58,237,0.45)]">
            {/* Windows-titelbalk */}
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-2">
              <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-brand-500 to-brand-700 text-[9px] font-bold text-white">S</span>
                Saldova
              </span>
              <span aria-hidden className="flex items-center gap-4 text-slate-500">
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><path d="M1 5h8" /></svg>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1.5" y="1.5" width="7" height="7" /></svg>
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
              </span>
            </div>
            {/* Mini-dashboard binnenin */}
            <div className="flex">
              {/* Sidebar-strook */}
              <div className="hidden w-40 shrink-0 flex-col gap-1 border-r border-white/[0.05] bg-[#0a0716] p-3 sm:flex">
                <p className="mb-1 px-2 text-[13px] font-bold">Saldo<span className="text-brand-400">va</span></p>
                {[ts("tabInvoices"), ts("tabTime"), ts("tabFiscale"), ts("tabBank")].map((label, i) => (
                  <span key={label} className={i === 0 ? "rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white" : "rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400"}>
                    {label}
                  </span>
                ))}
              </div>
              {/* Inhoud */}
              <div className="min-w-0 flex-1 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.05] bg-[#16102E] p-3">
                    <p className="text-[10px] text-[#c4b5fd]">{ts("revenue")}</p>
                    <p className="tabular text-lg font-bold text-white">€ 12.400</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.05] bg-[#16102E] p-3">
                    <p className="text-[10px] text-[#c4b5fd]">{ts("open")}</p>
                    <p className="tabular text-lg font-bold text-white">€ 1.815</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-white/[0.05] bg-[#16102E] p-4">
                  <div className="flex h-20 items-end gap-2">
                    {[42, 60, 50, 74, 58, 88, 66, 92].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ZO KRIJG JE 'M — 3 stappen */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("stepsTitle")}</h2>
            <p className="mt-3 text-[#c4b5fd]">{t("stepsSubtitle")}</p>
          </div>
          <div className="relative mt-14 grid gap-6 md:grid-cols-3">
            <div aria-hidden className="pointer-events-none absolute inset-x-[16%] top-7 hidden h-px bg-gradient-to-r from-brand-500/40 via-brand-500/40 to-transparent md:block" />
            {(["plan", "download", "work"] as const).map((key, i) => (
              <div key={key} className="relative text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#a855f7]/30 bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-extrabold text-white shadow-[0_0_24px_rgba(124,58,237,0.4)]">
                  {i + 1}
                </div>
                <h3 className="mt-5 text-lg font-bold">{t(`steps.${key}.title`)}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[#c4b5fd]">{t(`steps.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WAT JE KRIJGT — zelfde vier kaarten als in de tool */}
      <section className="border-y border-white/[0.06] bg-[#0F0C20] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("featuresTitle")}</h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.key} className="rounded-2xl border border-[#a855f7]/20 bg-[#16102E] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-[#a855f7]/20">
                  <Icon name={f.icon} className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-bold">{tf(`${f.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#c4b5fd]">{tf(`${f.key}.desc`)}</p>
              </div>
            ))}
          </div>

          {/* Eerlijk: launcher-only — je data en de tool blijven in de cloud */}
          <p className="mx-auto mt-10 max-w-2xl rounded-2xl border border-[#a855f7]/20 bg-[#16102E] px-5 py-4 text-center text-sm text-[#c4b5fd]">
            <Icon name="shield" className="mr-1.5 inline h-4 w-4 align-[-3px] text-brand-300" />
            {t("launcherNote", { version: DESKTOP_VERSION })}
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-6 py-24">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-[#a855f7]/30 bg-gradient-to-br from-[#1a1140] to-[#0d0a20] px-6 py-14 text-center shadow-[0_0_60px_-16px_rgba(124,58,237,0.5)]">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("ctaTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-[#c4b5fd]">{t("ctaSubtitle")}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] transition-all duration-200 hover:bg-brand-500 hover:shadow-[0_0_28px_rgba(124,58,237,0.55)]">
                {t("ctaStart")}
              </Link>
              <Link href="/zzp#pricing" className="rounded-xl border border-white/15 bg-white/[0.05] px-7 py-3.5 font-semibold text-white backdrop-blur transition-colors duration-200 hover:bg-white/10">
                {t("ctaPlans")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
