import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { getOrCreateInvoiceSettings, formatInvoiceNumber } from "@/lib/invoice-settings";
import { QuoteForm } from "@/components/quotes/QuoteForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";

export default async function NewQuotePage() {
  const t = await getTranslations("quotes");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  const [customers, settings] = await Promise.all([
    db.customer.findMany({ where: { userId: user.accountId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getOrCreateInvoiceSettings(user.accountId),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={t("new")}
        action={
          <Link href="/quotes" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ← {t("title")}
          </Link>
        }
      />

      {customers.length === 0 ? (
        <EmptyState
          icon="users"
          title={t("noCustomers")}
          action={
            <Link href="/customers" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              + {t("customer")}
            </Link>
          }
        />
      ) : (
        <QuoteForm
          customers={customers}
          defaults={{
            vatRate: Number(settings.defaultVatRate),
            validDays: 30,
            notes: settings.defaultNotes ?? "",
            currency: settings.defaultCurrency,
            previewNumber: formatInvoiceNumber(settings.quotePrefix, settings.quoteNextNumber, settings.quotePadding),
          }}
        />
      )}
    </div>
  );
}
