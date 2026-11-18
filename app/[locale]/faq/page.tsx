import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Faq } from "@/components/landing/Faq";
import { pageMetadata } from "@/lib/seo";
import { buttonClass } from "@/components/ui/Button";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "faq");
}

// Categorieën met bijbehorende FAQ-sleutels (Q/A staan onder "faq.*").
const CATEGORIES = [
  { key: "getStarted", items: ["start", "trial", "switch"] },
  { key: "billing", items: ["payment", "cancel"] },
  { key: "privacy", items: ["avg", "data"] },
  { key: "features", items: ["invoiceLegal", "tax", "support"] },
  { key: "webshop", items: ["wsPlatforms", "wsOss"] },
] as const;

export default function FaqPage() {
  const t = useTranslations("faqPage");
  const tc = useTranslations("contact");

  return (
    <div className="flex min-h-screen flex-col bg-grond">
      <SiteHeader />

      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">{t("title")}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">{t("subtitle")}</p>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 sm:px-6">
          {CATEGORIES.map((cat) => (
            <div key={cat.key}>
              <h2 className="mb-4 text-lg font-bold text-white">{t(`categories.${cat.key}`)}</h2>
              <Faq items={[...cat.items]} />
            </div>
          ))}
        </div>
      </section>

      {/* Nog vragen? */}
      <section className="border-y border-rand bg-kaart/40 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-white">{t("stillQuestions")}</h2>
          <p className="mt-2 text-slate-400">{t("stillQuestionsSub")}</p>
          <Link href="/contact" className={`${buttonClass("primary", "lg")} mt-6`}>
            {tc("title")}
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
