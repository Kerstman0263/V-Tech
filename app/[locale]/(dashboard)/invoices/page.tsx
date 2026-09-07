import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { InvoiceManager } from "@/components/invoices/InvoiceManager";
import { can } from "@/lib/permissions";

export default async function InvoicesPage() {
  const t = await getTranslations("invoices");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

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
      <InvoiceManager />
    </div>
  );
}
