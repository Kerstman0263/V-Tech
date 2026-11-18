import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "overstappen");
}

export default async function SwitchPage() {
  const t = await getTranslations("migration");
  return <div className="min-h-screen bg-surface text-white">
    <SiteHeader />
    <main>
      <section className="bg-grid-faint border-b border-white/5 px-5 py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-brand-300">{t("eyebrow")}</p>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t("title")}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">{t("intro")}</p>
            <div className="mt-7 flex flex-wrap items-center gap-5">
              <Link href="/register?route=switch" className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-500">{t("start")} →</Link>
              <Link href="/login?next=switch" className="text-sm font-semibold text-brand-200 underline">{t("existing")}</Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">{t("pace")}</p>
          </div>
          <div className="rounded-3xl border border-brand-400/20 bg-[#12112a] p-6 sm:p-8">
            <h2 className="text-lg font-semibold">{t("previewTitle")}</h2>
            <ol className="mt-6 space-y-5">
              {["export", "review", "continue"].map((step, index) => <li key={step} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 font-semibold text-brand-200">{index + 1}</span>
                <div><h3 className="font-semibold">{t(`${step}Title`)}</h3><p className="mt-1 text-sm leading-relaxed text-slate-400">{t(`${step}Desc`)}</p></div>
              </li>)}
            </ol>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <h2 className="text-2xl font-bold">{t("bringTitle")}</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">{t("bringIntro")}</p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {["customers", "bank", "documents"].map((key) => <article key={key} className="rounded-2xl border border-white/10 bg-[#12112a]/60 p-6">
            <h3 className="text-lg font-semibold">{t(`${key}Title`)}</h3><p className="mt-3 text-sm leading-relaxed text-slate-300">{t(`${key}Desc`)}</p>
          </article>)}
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 p-6">
          <h3 className="font-semibold">{t("archiveTitle")}</h3><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{t("archiveDesc")}</p>
        </div>
      </section>
      <section className="border-t border-white/5 bg-white/[0.02] px-5 py-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold">{t("prepareTitle")}</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">{t("prepareDesc")}</p>
          <div className="mt-5 flex flex-wrap gap-5 text-sm font-semibold text-brand-300">
            <a href="/templates/klanten.csv" download className="underline">{t("template")}</a>
            <Link href="/contact" className="underline">{t("help")}</Link>
          </div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
