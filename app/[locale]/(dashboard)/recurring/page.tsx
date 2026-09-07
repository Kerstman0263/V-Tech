import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecurringManager } from "@/components/recurring/RecurringManager";

export default async function RecurringPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations("recurring");
  const { locale } = await params;
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  const [customers, settings] = await Promise.all([
    db.customer.findMany({ where: { userId: user.accountId }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    getOrCreateInvoiceSettings(user.accountId),
  ]);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <RecurringManager customers={customers} defaultVat={settings.korEnabled ? 0 : Number(settings.defaultVatRate)} locale={locale} />
    </div>
  );
}
