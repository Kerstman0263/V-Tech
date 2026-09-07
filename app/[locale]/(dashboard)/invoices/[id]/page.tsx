import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { formatMoney } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { InvoiceActions } from "@/components/invoices/InvoiceActions";
import { can } from "@/lib/permissions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("invoices");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  const invoice = await db.invoice.findFirst({
    where: { id, userId: user.accountId },
    include: { customer: true, lineItems: { orderBy: { position: "asc" } }, user: { include: { company: true } } },
  });
  if (!invoice) notFound();

  const locale = invoice.user.locale ?? "nl";
  const money = (n: number) => formatMoney(n, locale, invoice.currency);
  const d = (date: Date) => date.toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={`${t("title")} ${invoice.invoiceNumber}`}
        action={
          <Link href="/invoices" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ← {t("title")}
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Factuur */}
        <Card className="min-w-0 break-words p-4 sm:p-6 lg:col-span-2">
          <div className="flex flex-col items-start justify-between gap-4 border-b border-white/[0.06] pb-4 sm:flex-row">
            <div>
              <p className="text-lg font-bold text-white">{invoice.user.company?.name ?? invoice.user.email}</p>
              <p className="text-sm text-slate-400">{decrypt(invoice.user.company?.vatNumber) ?? ""}</p>
            </div>
            <div className="sm:text-right">
              <InvoiceStatusBadge status={invoice.status} />
              <p className="mt-2 text-sm text-slate-400">{t("number")}: {invoice.invoiceNumber}</p>
              <p className="text-sm text-slate-400">{t("issueDate")}: {d(invoice.issueDate)}</p>
              {invoice.dueDate && <p className="text-sm text-slate-400">{t("dueDate")}: {d(invoice.dueDate)}</p>}
            </div>
          </div>

          <div className="py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("customer")}</p>
            <p className="mt-1 font-medium text-white">{invoice.customer.name}</p>
            {decrypt(invoice.customer.address) && <p className="text-sm text-slate-400">{decrypt(invoice.customer.address)}</p>}
            <p className="text-sm text-slate-400">
              {[invoice.customer.postalCode, invoice.customer.city].filter(Boolean).join(" ")}
            </p>
          </div>

          <div className="space-y-3 sm:hidden">
            {invoice.lineItems.map((li) => <div key={li.id} className="rounded-xl border border-white/10 p-3 text-sm">
              <p className="font-medium text-white">{li.description}</p>
              <dl className="mt-2 space-y-1 text-slate-300">
                <div className="flex justify-between gap-3"><dt>{t("quantity")}</dt><dd>{Number(li.quantity)}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t("unitPrice")}</dt><dd>{money(Number(li.unitPrice))}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t("vatRate")}</dt><dd>{Number(li.vatRate)}%</dd></div>
                <div className="flex justify-between gap-3 font-semibold"><dt>{t("total")}</dt><dd>{money(Number(li.lineTotal))}</dd></div>
              </dl>
            </div>)}
          </div>
          <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[560px] text-sm">
            <thead className="border-y border-white/[0.06] text-left text-slate-400">
              <tr>
                <th className="py-2">{t("description")}</th>
                <th className="py-2 text-right">{t("quantity")}</th>
                <th className="py-2 text-right">{t("unitPrice")}</th>
                <th className="py-2 text-right">{t("vatRate")}</th>
                <th className="py-2 text-right">{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id} className="border-b border-white/[0.04]">
                  <td className="py-2">{li.description}</td>
                  <td className="py-2 text-right">{Number(li.quantity)}</td>
                  <td className="py-2 text-right">{money(Number(li.unitPrice))}</td>
                  <td className="py-2 text-right">{Number(li.vatRate)}%</td>
                  <td className="py-2 text-right">{money(Number(li.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>

          <div className="mt-4 ml-auto w-56 max-w-full text-sm">
            <div className="flex justify-between py-1 text-slate-400"><span>{t("subtotal")}</span><span>{money(Number(invoice.subtotal))}</span></div>
            <div className="flex justify-between py-1 text-slate-400"><span>{t("vat")}</span><span>{money(Number(invoice.vatAmount))}</span></div>
            <div className="mt-1 flex justify-between border-t border-white/[0.06] pt-2 text-base font-bold text-white"><span>{t("total")}</span><span>{money(Number(invoice.total))}</span></div>
          </div>

          {invoice.notes && (
            <div className="mt-6 border-t border-white/[0.06] pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("notes")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{invoice.notes}</p>
            </div>
          )}
        </Card>

        {/* Acties */}
        <div className="lg:col-span-1">
          <InvoiceActions id={invoice.id} status={invoice.status} number={invoice.invoiceNumber} recipient={invoice.customer.name} recipientEmail={invoice.customer.email} totalLabel={money(Number(invoice.total))} />
        </div>
      </div>
    </div>
  );
}
