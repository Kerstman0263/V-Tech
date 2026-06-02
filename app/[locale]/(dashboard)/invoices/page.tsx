import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Link } from "@/i18n/routing";

export default async function InvoicesPage() {
  const t = await getTranslations("invoices");
  const session = await auth();

  const invoices = await db.invoice.findMany({
    where: { userId: session!.user.id },
    include: { customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link
          href="/invoices/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + {t("new")}
        </Link>
      </div>

      {invoices.length === 0 ? (
        <p className="text-gray-500">{t("empty")}</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">{t("number")}</th>
              <th className="px-4 py-2">{t("customer")}</th>
              <th className="px-4 py-2">{t("total")}</th>
              <th className="px-4 py-2">{t("issueDate")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{inv.invoiceNumber}</td>
                <td className="px-4 py-2">{inv.customer.name}</td>
                <td className="px-4 py-2">€ {Number(inv.total).toFixed(2)}</td>
                <td className="px-4 py-2">{inv.issueDate.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-2 text-right">
                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    className="text-brand-600 hover:underline"
                  >
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
