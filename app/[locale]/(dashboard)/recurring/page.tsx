import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecurringManager } from "@/components/recurring/RecurringManager";
import { recurringAccessFor } from "@/lib/recurring";

export default async function RecurringPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations("recurring");
  const { locale } = await params;
  const user = await requireUser();
  if (!can(user, "financials")) redirect(`/${locale}/dashboard`);

  const [customers, settings, access] = await Promise.all([
    db.customer.findMany({ where: { userId: user.accountId }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    getOrCreateInvoiceSettings(user.accountId),
    recurringAccessFor(db, user.accountId),
  ]);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {access && (
        <div role="status" className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">{t("blockedTitle")}</p>
          <p className="mt-1 text-amber-100/90">{access === "plan" ? t("blockedPlan") : t("blockedExpired")}</p>
        </div>
      )}
      <RecurringManager customers={customers} defaultVat={settings.korEnabled ? 0 : Number(settings.defaultVatRate)} locale={locale} />
    </div>
  );
}
