import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { Link } from "@/i18n/routing";

export default async function NewInvoicePage() {
  const t = await getTranslations("invoices");
  const session = await auth();

  const customers = await db.customer.findMany({
    where: { userId: session!.user.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">{t("new")}</h1>

      {customers.length === 0 ? (
        <p className="text-gray-500">
          {/* Geen klanten -> stuur de gebruiker eerst naar klanten */}
          <Link href="/customers" className="text-brand-600 hover:underline">
            {t("customer")} +
          </Link>
        </p>
      ) : (
        <InvoiceForm customers={customers} />
      )}
    </div>
  );
}
