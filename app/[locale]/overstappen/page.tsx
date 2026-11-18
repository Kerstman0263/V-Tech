import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { pageMetadata } from "@/lib/seo";
import { buttonClass } from "@/components/ui/Button";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "overstappen");
}

export default async function SwitchPage() {
  const t = await getTranslations("migration");
  return <div className="min-h-screen bg-grond text-white">
    <SiteHeader />
    <main>
      <section className="bg-grid-faint border-b border-rand px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-saldova-licht">{t("eyebrow")}</p>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t("title")}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">{t("intro")}</p>
            <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
              <Link href="/register?route=switch" className={`${buttonClass("primary", "lg")} w-full sm:w-auto`}>{t("start")} →</Link>
              <Link href="/login?next=switch" className="rounded text-sm font-semibold text-saldova-licht underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">{t("existing")}</Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">{t("pace")}</p>
          </div>
          <div className="rounded-3xl border border-rand bg-kaart p-6 sm:p-8">
            <h2 className="text-lg font-semibold">{t("previewTitle")}</h2>
            <ol className="mt-6 space-y-5">
              {["export", "review", "continue"].map((step, index) => <li key={step} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saldova/15 font-semibold text-saldova-licht">{index + 1}</span>
                <div><h3 className="font-semibold">{t(`${step}Title`)}</h3><p className="mt-1 text-sm leading-relaxed text-slate-400">{t(`${step}Desc`)}</p></div>
              </li>)}
            </ol>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-bold">{t("bringTitle")}</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">{t("bringIntro")}</p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {["customers", "bank", "documents"].map((key) => <article key={key} className="rounded-2xl border border-rand bg-kaart p-6">
            <h3 className="text-lg font-semibold">{t(`${key}Title`)}</h3><p className="mt-3 text-sm leading-relaxed text-slate-300">{t(`${key}Desc`)}</p>
          </article>)}
        </div>
        <div className="mt-5 rounded-2xl border border-rand p-6">
          <h3 className="font-semibold">{t("archiveTitle")}</h3><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{t("archiveDesc")}</p>
        </div>
        {/* Exportgarantie: wie overstapt, wil weten dat hij er ook weer uit kan */}
        <div className="mt-5 rounded-2xl border border-rand bg-kaart p-6">
          <h3 className="font-semibold">{t("guaranteeTitle")}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{t("guaranteeDesc")}</p>
          <Link href="/exportgarantie" className="mt-3 inline-flex rounded text-sm font-semibold text-saldova-licht underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">{t("guaranteeLink")} →</Link>
        </div>
      </section>
      <section className="border-t border-rand bg-kaart/40 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold">{t("prepareTitle")}</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">{t("prepareDesc")}</p>
          <div className="mt-5 flex flex-wrap gap-5 text-sm font-semibold text-saldova-licht">
            <a href="/templates/klanten.csv" download className="underline">{t("template")}</a>
            <Link href="/contact" className="underline">{t("help")}</Link>
          </div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
