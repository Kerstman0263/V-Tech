import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { OvaEi } from "@/components/ova-ei";
import { buttonClass } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { DESKTOP_VERSION, isDesktopDownloadAvailable } from "@/lib/desktop";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "windows");
}

/**
 * Publieke pagina voor de Windows-app (/windows). Zolang er geen download is
 * (DESKTOP_DOWNLOAD_URL = null in lib/desktop.ts) staat er eerlijk
 * "Beschikbaar bij de officiële lancering". De download zelf komt later achter
 * login + betaald plan (pagina /desktop in de tool). De installer is bewust
 * alleen een launcher: de tool zelf draait in de cloud.
 */
export default function WindowsPage() {
  const t = useTranslations("desktop.site");
  const tf = useTranslations("desktop.page.features");
  const ts = useTranslations("showcase");
  const available = isDesktopDownloadAvailable();

  const features: { icon: IconName; key: string }[] = [
    { icon: "monitor", key: "window" },
    { icon: "zap", key: "fast" },
    { icon: "shield", key: "same" },
    { icon: "lock", key: "secure" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-grond text-white">
      <SiteHeader />

      {/* HERO — één zachte violette gloed */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute left-1/2 top-[-8rem] h-[500px] w-[860px] max-w-[130%] -translate-x-1/2 rounded-full blur-[130px]"
            style={{ background: "radial-gradient(ellipse at center, rgba(124,58,237,0.12), transparent 72%)" }}
          />
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-rand bg-kaart px-4 py-1.5 text-sm font-semibold text-slate-200">
            <Icon name="monitor" className="h-4 w-4 text-saldova-licht" />
            {t("pill")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-[3.25rem]">{t("title")}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">{t("subtitle")}</p>

          <p className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-saldova-licht/30 bg-kaart px-4 py-1.5 text-sm font-medium text-saldova-licht">
            <Icon name="calendar" className="h-4 w-4" />
            {available ? t("availability.ready") : t("availability.soon")}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
              {t("ctaStart")}
            </Link>
            <Link href="/login" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
              {t("ctaLogin")}
            </Link>
          </div>

          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-slate-300">
            <span className="inline-flex items-center gap-1.5"><Icon name="star" className="h-3.5 w-3.5 text-saldova-licht" />{t("trust.paid")}</span>
            <span aria-hidden className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-saldova-licht" />{t("trust.freeWeb")}</span>
            <span aria-hidden className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-saldova-licht" />{t("trust.requirements")}</span>
          </p>
        </div>

        {/* WINDOWS-VENSTER MOCK — de app als venster op je bureaublad (decoratief) */}
        <div aria-hidden className="relative mx-auto max-w-4xl px-4 pb-4 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl border border-rand bg-kaart shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
            {/* Windows-titelbalk */}
            <div className="flex items-center justify-between border-b border-rand bg-grond px-4 py-2">
              <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <OvaEi merk="saldova" className="h-4 w-auto" />
                Saldova
              </span>
              <span className="flex items-center gap-4 text-slate-500">
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><path d="M1 5h8" /></svg>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1.5" y="1.5" width="7" height="7" /></svg>
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
              </span>
            </div>
            {/* Mini-dashboard binnenin */}
            <div className="flex">
              <div className="hidden w-40 shrink-0 flex-col gap-1 border-r border-rand bg-grond p-3 sm:flex">
                <OvaEi merk="saldova" className="mb-2 ml-2 h-5 w-auto" />
                {[ts("tabInvoices"), ts("tabTime"), ts("tabFiscale"), ts("tabBank")].map((label, i) => (
                  <span key={label} className={i === 0 ? "rounded-lg bg-saldova px-2.5 py-1.5 text-[11px] font-semibold text-white" : "rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400"}>
                    {label}
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-rand bg-grond p-3">
                    <p className="text-[10px] text-slate-400">{ts("revenue")}</p>
                    <p className="tabular text-lg font-bold text-white">€ 12.400</p>
                  </div>
                  <div className="rounded-xl border border-rand bg-grond p-3">
                    <p className="text-[10px] text-slate-400">{ts("open")}</p>
                    <p className="tabular text-lg font-bold text-white">€ 1.815</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-rand bg-grond p-4">
                  <div className="flex h-20 items-end gap-2">
                    {[42, 60, 50, 74, 58, 88, 66, 92].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t bg-saldova/80" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ZO KRIJG JE 'M — 3 stappen */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("stepsTitle")}</h2>
            <p className="mt-3 text-slate-300">{t("stepsSubtitle")}</p>
          </div>
          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {(["plan", "download", "work"] as const).map((key, i) => (
              <li key={key} className="rounded-2xl border border-rand bg-kaart p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-saldova text-lg font-extrabold text-white">
                  {i + 1}
                </div>
                <h3 className="mt-5 text-lg font-bold">{t(`steps.${key}.title`)}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-300">{t(`steps.${key}.desc`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* WAT JE KRIJGT */}
      <section className="border-y border-rand px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("featuresTitle")}</h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.key} className="rounded-2xl border border-rand bg-kaart p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht">
                  <Icon name={f.icon} className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-bold">{tf(`${f.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{tf(`${f.key}.desc`)}</p>
              </div>
            ))}
          </div>

          {/* Eerlijk: launcher-only — je data en de tool blijven in de cloud */}
          <p className="mx-auto mt-10 max-w-2xl rounded-2xl border border-rand bg-kaart px-5 py-4 text-center text-sm text-slate-300">
            <Icon name="shield" className="mr-1.5 inline h-4 w-4 align-[-3px] text-saldova-licht" />
            {t("launcherNote", { version: DESKTOP_VERSION })}
          </p>
        </div>
      </section>

      {/* SLOT-CTA */}
      <section className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-rand bg-kaart px-6 py-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">{t("ctaSubtitle")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
              {t("ctaStart")}
            </Link>
            <Link href="/zzp#pricing" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
              {t("ctaPlans")}
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
