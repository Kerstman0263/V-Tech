import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { canUseDesktopApp, isDesktopUserAgent, desktopVersionFromUA, DESKTOP_DOWNLOAD_URL, DESKTOP_VERSION } from "@/lib/desktop";
import { DESKTOP_RELEASES, DESKTOP_UPCOMING, LATEST_DESKTOP_VERSION } from "@/lib/changelog";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Link } from "@/i18n/routing";

/**
 * Saldova voor Windows — downloadpagina in de tool.
 * De app zelf is een betaald voordeel: gratis accounts zien hier de upgrade-
 * pitch, betaalde accounts (en platformbeheerders) de download. Zolang er nog
 * geen publieke hosting is (DESKTOP_DOWNLOAD_URL = null) tonen we eerlijk
 * "beschikbaar bij de launch" in plaats van een dode knop.
 */
export default async function DesktopPage() {
  const t = await getTranslations("desktop.page");
  const user = await requireUser();

  const [account, hdrs] = await Promise.all([
    db.user.findUnique({
      where: { id: user.accountId },
      select: { subscription: { select: { plan: true } } },
    }),
    headers(),
  ]);
  const plan = account?.subscription?.plan ?? "FREE";
  const allowed = canUseDesktopApp(plan, user.role as "USER" | "ADMIN" | "OWNER");
  const ua = hdrs.get("user-agent");
  const inDesktop = isDesktopUserAgent(ua);
  const appVersion = desktopVersionFromUA(ua);
  // Geen parseerbare versie in de UA? Dan niet doen alsof er een update is —
  // anders staat er "jouw versie 1.0.0" naast "update naar 1.0.0".
  const upToDate = !appVersion || appVersion === LATEST_DESKTOP_VERSION;

  const locale = await getLocale();
  const lang: "nl" | "en" = locale === "en" ? "en" : "nl";
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

  const features: { icon: IconName; key: string }[] = [
    { icon: "monitor", key: "window" },
    { icon: "zap", key: "fast" },
    { icon: "shield", key: "same" },
    { icon: "lock", key: "secure" },
  ];

  return (
    <div className="relative max-w-3xl">
      <div aria-hidden className="pointer-events-none absolute -top-10 right-0 -z-0 h-64 w-64 rounded-full bg-brand-500/10 blur-[110px]" />

      <div className="relative">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        {/* Hero-kaart: app-presentatie + download/upgrade-status */}
        <div data-tour="desktop-hero" className="relative overflow-hidden rounded-3xl border border-[#7c3aed]/20 bg-gradient-to-br from-[#1e1145] to-[#0f0a26] p-8 shadow-xl shadow-black/30">
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-brand-500/20 blur-3xl" />

          <div className="relative flex flex-wrap items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-glow-md">
              <Icon name="monitor" className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold text-white">{t("appName")}</p>
              <p className="mt-0.5 text-sm text-slate-400">
                {t("versionLabel")} {DESKTOP_VERSION} · Windows 10/11 (64-bit)
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-200 ring-1 ring-brand-500/20">
              <Icon name="star" className="h-3.5 w-3.5" />
              {t("paidBadge")}
            </span>
          </div>

          <div data-tour="desktop-get-app" className="relative mt-7">
            {inDesktop ? (
              // Binnen de desktop-app zelf: jouw versie + update-status
              <div
                className={
                  upToDate
                    ? "rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4"
                    : "rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4"
                }
              >
                <div className="flex items-center gap-3">
                  <Icon name={upToDate ? "check-circle" : "download"} className={upToDate ? "h-6 w-6 shrink-0 text-emerald-400" : "h-6 w-6 shrink-0 text-amber-400"} />
                  <div>
                    <p className={upToDate ? "text-sm font-semibold text-emerald-200" : "text-sm font-semibold text-amber-200"}>
                      {t("yourVersion")}: {appVersion ?? DESKTOP_VERSION}
                      {upToDate ? ` — ${t("upToDate")}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {upToDate ? t("alreadyInApp") : t("updateAvailable", { version: LATEST_DESKTOP_VERSION })}
                    </p>
                  </div>
                </div>
              </div>
            ) : allowed ? (
              DESKTOP_DOWNLOAD_URL ? (
                <a
                  href={DESKTOP_DOWNLOAD_URL}
                  className="inline-flex items-center gap-2.5 rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] transition-all duration-200 hover:bg-brand-500 hover:shadow-[0_0_28px_rgba(124,58,237,0.55)]"
                >
                  <Icon name="download" className="h-5 w-5" />
                  {t("downloadCta")}
                </a>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-[#a855f7]/20 bg-white/[0.04] px-5 py-4">
                  <Icon name="hourglass" className="h-6 w-6 shrink-0 text-brand-300" />
                  <p className="text-sm text-slate-300">{t("comingSoon")}</p>
                </div>
              )
            ) : (
              // Gratis account: upgrade-pitch
              <div className="rounded-2xl border border-[#a855f7]/20 bg-white/[0.04] p-5">
                <div className="flex items-start gap-3">
                  <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                  <div>
                    <p className="font-semibold text-white">{t("lockedTitle")}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{t("lockedBody")}</p>
                  </div>
                </div>
                <Link
                  href="/settings"
                  className="mt-4 inline-block rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md"
                >
                  {t("upgradeCta")}
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Wat je krijgt */}
        <div data-tour="desktop-features" className="mt-6 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.key} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-[#a855f7]/20">
                <Icon name={f.icon} className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold text-white">{t(`features.${f.key}.title`)}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{t(`features.${f.key}.desc`)}</p>
            </div>
          ))}
        </div>

        {/* WAT IS ER NIEUW — changelog per release */}
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Icon name="zap" className="h-5 w-5 text-brand-300" />
            {t("changelogTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t("changelogHint")}</p>
          <div className="mt-4 space-y-4">
            {DESKTOP_RELEASES.map((rel) => (
              <div key={rel.version} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs font-bold text-brand-200 ring-1 ring-brand-500/20">
                    v{rel.version}
                  </span>
                  {rel.version === LATEST_DESKTOP_VERSION && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                      {t("latestBadge")}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">{fmtDate(rel.date)}</span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {rel.items.map((item) => (
                    <li key={item.nl} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                      {item[lang]}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* BINNENKORT — roadmap van de app */}
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Icon name="hourglass" className="h-5 w-5 text-brand-300" />
            {t("upcomingTitle")}
          </h2>
          <ul className="mt-4 space-y-2">
            {DESKTOP_UPCOMING.map((item) => (
              <li key={item.nl} className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-3.5 text-sm text-slate-300">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-fuchsia-400" />
                {item[lang]}
              </li>
            ))}
          </ul>
        </div>

        {/* Telefoon blijft gratis — eerlijk erbij vermelden */}
        <p data-tour="desktop-phone-note" className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4 text-sm text-slate-400">
          <Icon name="phone" className="mr-2 inline h-4 w-4 align-[-2px] text-brand-300" />
          {t("phoneNote")}
        </p>
      </div>
    </div>
  );
}
