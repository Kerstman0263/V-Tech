import { useTranslations } from "next-intl";
import { LegalPage } from "@/components/legal/LegalPage";
import { LegalBody } from "@/components/legal/LegalBody";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "privacy");
}

export default function PrivacyPage() {
  const t = useTranslations("legal");
  return (
    <LegalPage title={t("privacy.title")} updatedLabel={t("updated")}>
      <LegalBody doc="privacy" />
    </LegalPage>
  );
}
