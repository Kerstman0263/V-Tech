import { useTranslations } from "next-intl";
import { LegalPage } from "@/components/legal/LegalPage";
import { LegalBody } from "@/components/legal/LegalBody";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "terms");
}

export default function TermsPage() {
  const t = useTranslations("legal");
  return (
    <LegalPage title={t("terms.title")} updatedLabel={t("updated")}>
      <LegalBody doc="terms" />
    </LegalPage>
  );
}
