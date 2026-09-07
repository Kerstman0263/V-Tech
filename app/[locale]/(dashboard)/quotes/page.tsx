import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { QuoteManager } from "@/components/quotes/QuoteManager";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";

export default async function QuotesPage() {
  const t = await getTranslations("quotes");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");
  const dbUser = await db.user.findUnique({ where: { id: user.accountId }, select: { locale: true } });

  return (
    <div>
      <div data-tour="quotes-intro">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
      </div>
      <div data-tour="quotes-overview">
        <QuoteManager locale={dbUser?.locale ?? "nl"} />
      </div>
    </div>
  );
}
