import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { can } from "@/lib/permissions";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductManager } from "@/components/products/ProductManager";

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations("products");
  const { locale } = await params;
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");
  const settings = await getOrCreateInvoiceSettings(user.accountId);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ProductManager locale={locale} kor={settings.korEnabled} />
    </div>
  );
}
