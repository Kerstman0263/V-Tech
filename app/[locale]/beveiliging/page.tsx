import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { CompanyDetails } from "@/components/company/CompanyDetails";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buttonClass } from "@/components/ui/Button";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  DATA_LOCATIONS,
  ENCRYPTED_FIELDS,
  LOGIN_MEASURES,
  PROCESSORS,
  SECURITY_TXT_PATH,
  TEAM_ROLES,
  securityMessageValues,
} from "@/lib/security-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "beveiliging");
}

/**
 * Beveiliging: wat Saldova nu echt doet om je gegevens te beschermen. Elk punt is nagelopen in de
 * code en de config (zie lib/security-page.ts); tests/security-page.test.ts bewaakt dat.
 */
const SUMMARY = ["location", "encryption", "login", "team", "report"] as const;

const LOCATION_ICONS: Record<(typeof DATA_LOCATIONS)[number], IconName> = {
  app: "monitor",
  database: "folder",
  email: "mail",
};

const LOGIN_ICONS: Record<(typeof LOGIN_MEASURES)[number], IconName> = {
  bcrypt: "lock",
  totp: "phone",
  limits: "hourglass",
  sessions: "refresh",
};

const BREACH_STEPS = ["ap", "customers", "people", "log"] as const;
const REPORT_ASKS = ["what", "own", "time"] as const;

const linkClass =
  "rounded text-sm font-semibold text-saldova-licht underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht";

function SectionHead({ id, title, desc }: { id?: string; title: string; desc: string }) {
  return (
    <>
      <h2 id={id} className="scroll-mt-24 text-2xl font-bold">{title}</h2>
      <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">{desc}</p>
    </>
  );
}

export default async function SecurityPage() {
  const t = await getTranslations("securityPage");
  const values = securityMessageValues();

  return (
    <div className="min-h-screen bg-grond text-white">
      <SiteHeader />
      <main>
        {/* Kop */}
        <section className="bg-grid-faint border-b border-rand px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-saldova-licht">{t("eyebrow")}</p>
              <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t("title")}</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">{t("intro")}</p>
              <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
                <a href="#melden" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>{t("reportCta")}</a>
                <a href="#gegevens" className={linkClass}>{t("dataLink")}</a>
              </div>
            </div>
            <div className="rounded-3xl border border-rand bg-kaart p-6 sm:p-8">
              <h2 className="text-lg font-semibold">{t("summaryTitle")}</h2>
              <ul className="mt-6 space-y-4">
                {SUMMARY.map((key) => (
                  <li key={key} className="flex items-start gap-3">
                    <Icon name="check-circle" className="mt-0.5 h-5 w-5 shrink-0 text-saldova-licht" />
                    <span className="leading-relaxed text-slate-200">{t(`summary.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Waar je gegevens staan */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHead id="gegevens" title={t("sections.location.title")} desc={t("sections.location.desc")} />
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {DATA_LOCATIONS.map((key) => (
              <article key={key} className="rounded-2xl border border-rand bg-kaart p-6">
                <span className="inline-flex rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
                  <Icon name={LOCATION_ICONS[key]} className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{t(`location.${key}.title`)}</h3>
                <p className="mt-1 text-sm font-medium text-saldova-licht">{t(`location.${key}.where`)}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{t(`location.${key}.desc`)}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-400">{t("locationNote")}</p>
        </section>

        {/* Versleuteling */}
        <section className="border-t border-rand bg-kaart/40 px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHead title={t("sections.encryption.title")} desc={t("sections.encryption.desc")} />
            <div className="mt-7 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-saldova-licht/30 bg-kaart p-6">
                <h3 className="font-semibold">{t("encryptedTitle")}</h3>
                <ul className="mt-4 space-y-3">
                  {ENCRYPTED_FIELDS.map((key) => (
                    <li key={key} className="flex items-start gap-3 text-sm leading-relaxed text-slate-300">
                      <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-saldova-licht" />
                      <span>{t(`encrypted.${key}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-4">
                <div className="rounded-2xl border border-rand bg-kaart p-6">
                  <h3 className="font-semibold">{t("httpsTitle")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("httpsDesc")}</p>
                </div>
                <div className="rounded-2xl border border-rand p-6">
                  <h3 className="font-semibold">{t("notEncryptedTitle")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("notEncryptedDesc")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Inloggen */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHead title={t("sections.login.title")} desc={t("sections.login.desc")} />
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {LOGIN_MEASURES.map((key) => (
              <article key={key} className="rounded-2xl border border-rand bg-kaart p-6">
                <span className="inline-flex rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
                  <Icon name={LOGIN_ICONS[key]} className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{t(`login.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{t(`login.${key}.desc`, values)}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-400">{t("limitsNote")}</p>
        </section>

        {/* Rechten in een team */}
        <section className="border-t border-rand bg-kaart/40 px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHead title={t("sections.team.title")} desc={t("sections.team.desc")} />
            <ul className="mt-7 grid gap-4 md:grid-cols-2">
              {TEAM_ROLES.map((key) => (
                <li key={key} className="flex items-start gap-4 rounded-2xl border border-rand bg-kaart p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht">
                    <Icon name={key === "owner" ? "building" : key === "accountant" ? "briefcase" : key === "manager" ? "users" : "user"} className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{t(`roles.${key}.title`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">{t(`roles.${key}.desc`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-saldova-licht/30 bg-kaart p-6">
                <h3 className="font-semibold">{t("accountantTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("accountantDesc")}</p>
              </div>
              <div className="rounded-2xl border border-rand p-6">
                <h3 className="font-semibold">{t("teamCheckTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("teamCheckDesc")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Meekijken met verdacht verkeer */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHead title={t("sections.monitoring.title")} desc={t("sections.monitoring.desc")} />
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-rand bg-kaart p-6">
              <span className="inline-flex rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{t("shieldDataTitle")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("shieldDataDesc")}</p>
            </div>
            <div className="rounded-2xl border border-rand bg-kaart p-6">
              <span className="inline-flex rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
                <Icon name="globe" className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{t("otherTitle")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("otherDesc")}</p>
            </div>
          </div>
        </section>

        {/* Subverwerkers */}
        <section className="border-t border-rand bg-kaart/40 px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHead title={t("sections.processors.title")} desc={t("sections.processors.desc")} />
            <ul className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PROCESSORS.map((key) => (
                <li key={key} className="rounded-2xl border border-rand bg-kaart p-5">
                  <h3 className="font-semibold">{t(`processors.${key}.name`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(`processors.${key}.role`)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-5">
              <Link href="/legal/privacy" className={linkClass}>{t("privacyLink")}</Link>
              <Link href="/legal/dpa" className={linkClass}>{t("dpaLink")}</Link>
            </div>
          </div>
        </section>

        {/* Back-ups */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <Card className="max-w-3xl p-6 sm:p-8">
            <span className="inline-flex rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
              <Icon name="download" className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-2xl font-bold">{t("sections.backups.title")}</h2>
            <p className="mt-3 leading-relaxed text-slate-300">{t("sections.backups.desc")}</p>
            <Link href="/exportgarantie" className={cn(linkClass, "mt-5 inline-flex")}>{t("exportLink")}</Link>
          </Card>
        </section>

        {/* Een lek melden en wat we doen bij een datalek */}
        <section className="border-t border-rand px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-saldova-licht/30 bg-kaart p-6 sm:p-8">
              <h2 id="melden" className="scroll-mt-24 text-2xl font-bold">{t("sections.report.title")}</h2>
              <p className="mt-3 leading-relaxed text-slate-300">{t("sections.report.desc")}</p>
              <ol className="mt-6 space-y-4">
                {REPORT_ASKS.map((key, index) => (
                  <li key={key} className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-saldova/15 text-sm font-semibold text-saldova-licht">{index + 1}</span>
                    <span className="text-sm leading-relaxed text-slate-300">{t(`reportAsks.${key}`)}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
                <Link href="/contact" className={cn(buttonClass("primary"), "w-full sm:w-auto")}>{t("reportContact")} →</Link>
                {/* Gewone <a>: security.txt is een bestand in public/, geen pagina met taalprefix. */}
                <a href={SECURITY_TXT_PATH} className={linkClass}>{t("securityTxtLink")}</a>
              </div>
              <p className="mt-5 text-xs leading-relaxed text-slate-400">{t("securityTxtDesc")}</p>
            </div>
            <div className="rounded-3xl border border-rand bg-kaart p-6 sm:p-8">
              <h2 className="text-2xl font-bold">{t("sections.breach.title")}</h2>
              <p className="mt-3 leading-relaxed text-slate-300">{t("sections.breach.desc")}</p>
              <ul className="mt-6 space-y-4">
                {BREACH_STEPS.map((key) => (
                  <li key={key} className="flex items-start gap-3">
                    <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-saldova-licht" />
                    <span className="text-sm leading-relaxed text-slate-300">{t(`breach.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Wie staat hierachter: de bedrijfsgegevens uit lib/company.ts */}
        <section className="border-t border-rand px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-bold">{t("companyTitle")}</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-slate-300">{t("companyIntro")}</p>
            <CompanyDetails className="mt-6 max-w-3xl" />
            <Card className="mt-6 max-w-3xl p-5 sm:p-6">
              <h3 className="font-semibold">{t("questionsTitle")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("questionsDesc")}</p>
              <div className="mt-4 flex flex-wrap gap-5">
                <Link href="/contact" className={linkClass}>{t("contact")}</Link>
                <Link href="/exportgarantie" className={linkClass}>{t("exportLink")}</Link>
                <Link href="/legal/privacy" className={linkClass}>{t("privacyLink")}</Link>
              </div>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
