import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExpenseManager } from "@/components/expenses/ExpenseManager";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";

// Zakelijke uitgaven met bonnetjes — voedt de voorbelasting op /btw.
export default async function ExpensesPage() {
  const t = await getTranslations("expenses");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ExpenseManager />
    </div>
  );
}
