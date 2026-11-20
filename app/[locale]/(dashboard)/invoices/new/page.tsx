import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { getOrCreateInvoiceSettings, formatInvoiceNumber } from "@/lib/invoice-settings";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { korYearStatus } from "@/lib/kor";
import { parseVatScheme } from "@/lib/vat-scheme";

export default async function NewInvoicePage() {
  const t = await getTranslations("invoices");
  const user = await requireUser();
  if (!can(user, "financials")) redirect(`/${await getLocale()}/dashboard`);

  const [customers, settings] = await Promise.all([
    db.customer.findMany({
      where: { userId: user.accountId },
      select: { id: true, name: true, vatScheme: true, vatNumber: true, country: true },
      orderBy: { name: "asc" },
    }),
    getOrCreateInvoiceSettings(user.accountId),
  ]);
  // KOR: hoe dicht zit de omzet van dit jaar bij de grens?
  const kor = settings.korEnabled ? await korYearStatus(db, user.accountId, new Date().getUTCFullYear()) : null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={t("new")}
        action={
          <Link href="/invoices" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
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
        <InvoiceForm
          customers={customers.map((c) => ({ ...c, vatScheme: parseVatScheme(c.vatScheme) }))}
          korStatus={kor && kor.level !== "ok" ? { level: kor.level, revenue: kor.revenue, threshold: kor.threshold, year: kor.year } : null}
          defaults={{
            // KOR: geen btw op de factuur (default 0%) + wettelijke vermelding.
            vatRate: settings.korEnabled ? 0 : Number(settings.defaultVatRate),
            kor: settings.korEnabled,
            dueDays: settings.defaultDueDays,
            notes: settings.korEnabled
              ? [settings.defaultNotes, t("korNotice")].filter(Boolean).join("\n\n")
              : settings.defaultNotes ?? "",
            currency: settings.defaultCurrency,
            previewNumber: formatInvoiceNumber(
              settings.invoicePrefix,
              settings.nextNumber,
              settings.numberPadding,
            ),
          }}
        />
      )}
    </div>
  );
}
