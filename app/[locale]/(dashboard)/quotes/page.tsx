import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { QuoteManager } from "@/components/quotes/QuoteManager";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { missingSenderFields } from "@/lib/invoice-sender";
import { SenderDetailsNotice } from "@/components/invoices/SenderDetailsNotice";

export default async function QuotesPage() {
  const t = await getTranslations("quotes");
  const user = await requireUser();
  if (!can(user, "financials")) redirect(`/${await getLocale()}/dashboard`);
  const [dbUser, company, settings] = await Promise.all([
    db.user.findUnique({ where: { id: user.accountId }, select: { locale: true } }),
    db.company.findUnique({ where: { userId: user.accountId } }),
    db.invoiceSettings.findUnique({ where: { userId: user.accountId }, select: { korEnabled: true } }),
  ]);
  // Een online geaccepteerde offerte met aanbetaling maakt meteen een factuur;
  // zonder complete afzendergegevens wordt die niet gemaild.
  const missingSender = missingSenderFields(company, settings?.korEnabled ?? false);

  return (
    <div>
      <div data-tour="quotes-intro">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
      </div>
      <SenderDetailsNotice missing={missingSender} automatic className="mb-6" />
      <div data-tour="quotes-overview">
        <QuoteManager locale={dbUser?.locale ?? "nl"} />
      </div>
    </div>
  );
}
