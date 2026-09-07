import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { can } from "@/lib/permissions";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { SnelleOfferte } from "@/components/snelle-offerte/SnelleOfferte";

export default async function SnelleOffertePage({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations("snelleOfferte");
  const { locale } = await params;
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  // KOR (kleineondernemersregeling) -> standaard 0% btw voorstellen
  const settings = await getOrCreateInvoiceSettings(user.accountId);

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SnelleOfferte locale={locale} kor={settings.korEnabled} />
    </div>
  );
}
