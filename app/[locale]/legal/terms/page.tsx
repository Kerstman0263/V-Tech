import { useTranslations } from "next-intl";
import { LegalPage } from "@/components/legal/LegalPage";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "terms");
}

export default function TermsPage() {
  const t = useTranslations("legal");
  return (
    <LegalPage title={t("terms.title")} updatedLabel={t("updated")}>
      <p>{t("terms.intro")}</p>
      <div className="mt-8 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-5 not-prose">
        <p className="text-sm text-slate-400">{t("placeholder")}</p>
      </div>
    </LegalPage>
  );
}
