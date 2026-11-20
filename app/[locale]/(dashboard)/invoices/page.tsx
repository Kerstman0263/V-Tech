import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { InvoiceManager } from "@/components/invoices/InvoiceManager";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { missingSenderFields } from "@/lib/invoice-sender";
import { SenderDetailsNotice } from "@/components/invoices/SenderDetailsNotice";

export default async function InvoicesPage() {
  const t = await getTranslations("invoices");
  const user = await requireUser();
  if (!can(user, "financials")) redirect(`/${await getLocale()}/dashboard`);
  // Ontbrekende afzendergegevens hier al melden: dan gaan ook automatische
  // facturen (aanbetaling, periodiek) niet per mail weg.
  const [company, settings] = await Promise.all([
    db.company.findUnique({ where: { userId: user.accountId } }),
    db.invoiceSettings.findUnique({ where: { userId: user.accountId }, select: { korEnabled: true } }),
  ]);
  const missingSender = missingSenderFields(company, settings?.korEnabled ?? false);

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("listSubtitle")}
        action={
          <Link href="/invoices/settings" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ⚙️ {t("settingsLink")}
          </Link>
        }
      />
      <SenderDetailsNotice missing={missingSender} automatic className="mb-6" />
      <InvoiceManager />
    </div>
  );
}
