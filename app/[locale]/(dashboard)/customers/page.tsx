import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerManager } from "@/components/customers/CustomerManager";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";

export default async function CustomersPage() {
  const t = await getTranslations("customers");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <CustomerManager />
    </div>
  );
}
