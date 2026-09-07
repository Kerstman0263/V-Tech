import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { BankManager } from "@/components/bank/BankManager";

export default async function BankPage() {
  const t = await getTranslations("bank");
  const user = await requireUser();
  // Bankimport is financieel — alleen eigenaar/admin.
  if (!can(user, "financials")) redirect("/dashboard");

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <BankManager />
    </div>
  );
}
