import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { can } from "@/lib/permissions";
import { hasWebshopPlan } from "@/lib/webshop/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { WebshopManager } from "@/components/webshop/WebshopManager";

export default async function WebshopPage() {
  const t = await getTranslations("webshop");
  const user = await requireUser();
  // Omzet en btw zijn financieel — alleen met facturatierechten.
  if (!can(user, "financials")) redirect("/dashboard");
  const canConnect = await hasWebshopPlan(user.accountId);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <WebshopManager canConnect={canConnect} />
    </div>
  );
}
