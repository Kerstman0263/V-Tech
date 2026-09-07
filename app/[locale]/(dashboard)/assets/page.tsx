import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { AssetManager } from "@/components/assets/AssetManager";

export default async function AssetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations("assets");
  const { locale } = await params;
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <AssetManager locale={locale} />
    </div>
  );
}
