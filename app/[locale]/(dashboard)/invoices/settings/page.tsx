import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { InvoiceSettingsForm } from "@/components/invoices/InvoiceSettingsForm";
import { Link } from "@/i18n/routing";

export default async function InvoiceSettingsPage() {
  const t = await getTranslations("invoiceSettings");
  const user = await requireUser();
  const s = await getOrCreateInvoiceSettings(user.accountId);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Link href="/invoices" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ← {t("backToInvoices")}
          </Link>
        }
      />
      <InvoiceSettingsForm
        initial={{
          invoicePrefix: s.invoicePrefix,
          nextNumber: s.nextNumber,
          numberPadding: s.numberPadding,
          defaultVatRate: Number(s.defaultVatRate),
          korEnabled: s.korEnabled,
          defaultDueDays: s.defaultDueDays,
          defaultCurrency: s.defaultCurrency,
          defaultNotes: s.defaultNotes ?? "",
          footerText: s.footerText ?? "",
          paymentTerms: s.paymentTerms ?? "",
          accentColor: s.accentColor,
          quotePrefix: s.quotePrefix,
          quoteNextNumber: s.quoteNextNumber,
          quotePadding: s.quotePadding,
          reminderEnabled: s.reminderEnabled,
          reminderIntervalDays: s.reminderIntervalDays,
          reminderMaxCount: s.reminderMaxCount,
        }}
      />
    </div>
  );
}
