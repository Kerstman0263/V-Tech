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
import { DELETE_STEPS, EXPORT_CONTENTS, guaranteeMessageValues } from "@/lib/export-guarantee";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "exportgarantie");
}

/**
 * Exportgarantie: wat Saldova belooft over je gegevens. Elk punt is nagelopen in de code (zie
 * lib/export-guarantee.ts); de termijn bij stoppen (SHUTDOWN_NOTICE_DAYS) moet de eigenaar nog
 * bevestigen.
 */
const PROMISES: { key: "own" | "always" | "cancel" | "stop"; icon: IconName }[] = [
  { key: "own", icon: "lock" },
  { key: "always", icon: "download" },
  { key: "cancel", icon: "calendar" },
  { key: "stop", icon: "alert" },
];

const CONTENT_ICONS: Record<(typeof EXPORT_CONTENTS)[number], IconName> = {
  data: "folder",
  files: "receipt",
  invoices: "invoice",
  readme: "check-circle",
};

const linkClass =
  "rounded text-sm font-semibold text-saldova-licht underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht";

export default async function ExportGuaranteePage() {
  const t = await getTranslations("exportGuarantee");
  const values = guaranteeMessageValues();

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
                <Link href="/register" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>{t("start")} →</Link>
                <a href="#inhoud" className={linkClass}>{t("howItWorks")}</a>
              </div>
            </div>
            <div className="rounded-3xl border border-rand bg-kaart p-6 sm:p-8">
              <h2 className="text-lg font-semibold">{t("summaryTitle")}</h2>
              <ul className="mt-6 space-y-4">
                {PROMISES.map((p) => (
                  <li key={p.key} className="flex items-start gap-3">
                    <Icon name="check-circle" className="mt-0.5 h-5 w-5 shrink-0 text-saldova-licht" />
                    <span className="leading-relaxed text-slate-200">{t(`summary.${p.key}`, values)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* De beloftes */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold">{t("promisesTitle")}</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {PROMISES.map((p) => (
              <article key={p.key} className="rounded-2xl border border-rand bg-kaart p-6">
                <span className="inline-flex rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
                  <Icon name={p.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{t(`sections.${p.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{t(`sections.${p.key}.desc`, values)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Wat er in de export zit */}
        <section id="inhoud" className="scroll-mt-24 border-t border-rand bg-kaart/40 px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-bold">{t("sections.contents.title")}</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-slate-300">{t("sections.contents.desc")}</p>
            <ul className="mt-7 grid gap-4 md:grid-cols-2">
              {EXPORT_CONTENTS.map((key) => (
                <li key={key} className="flex items-start gap-4 rounded-2xl border border-rand bg-kaart p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht">
                    <Icon name={CONTENT_ICONS[key]} className="h-4 w-4" />
                  </span>
                  <span className="text-sm leading-relaxed text-slate-300">{t(`contents.${key}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-saldova-licht/30 bg-kaart p-6">
                <h3 className="font-semibold">{t("auditfileTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("auditfileDesc")}</p>
              </div>
              <div className="rounded-2xl border border-rand p-6">
                <h3 className="font-semibold">{t("notIncludedTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("notIncludedDesc")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Account verwijderen: eerst de export, dan wissen */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold">{t("sections.delete.title")}</h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-300">{t("sections.delete.desc")}</p>
          <ol className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {DELETE_STEPS.map((step, index) => (
              <li key={step} className="rounded-2xl border border-rand bg-kaart p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-saldova/15 font-semibold text-saldova-licht">{index + 1}</span>
                <h3 className="mt-4 font-semibold">{t(`deleteSteps.${step}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t(`deleteSteps.${step}.desc`)}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-400">{t("deleteNote")}</p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">{t("deleteGateNote")}</p>
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
                <Link href="/overstappen" className={linkClass}>{t("switchLink")}</Link>
                <Link href="/faq" className={linkClass}>{t("faqLink")}</Link>
              </div>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
