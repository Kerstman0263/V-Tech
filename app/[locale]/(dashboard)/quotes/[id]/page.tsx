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
import { QuoteStatusBadge } from "@/components/ui/StatusBadge";
import { QuoteActions } from "@/components/quotes/QuoteActions";
import { can } from "@/lib/permissions";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id } = await params;
  const t = await getTranslations("quotes");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  const quote = await db.quote.findFirst({
    where: { id, userId: user.accountId },
    include: { customer: true, lineItems: { orderBy: { position: "asc" } }, user: { include: { company: true } } },
  });
  if (!quote) notFound();

  const dbUser = await db.user.findUnique({ where: { id: user.accountId }, select: { locale: true } });
  const locale = dbUser?.locale ?? "nl";
  const money = (n: number) => formatMoney(n, locale, quote.currency);
  const d = (date: Date) => date.toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={`${t("title")} ${quote.quoteNumber}`}
        action={
          <Link href="/quotes" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ← {t("title")}
          </Link>
        }
      />

      {quote.status === "DECLINED" && quote.declineReason && (
        <div className="mb-6 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <strong>{t("declinedReasonTitle")}:</strong> {quote.declineReason}
        </div>
      )}

      {quote.signatureName && quote.acceptedAt && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {quote.signatureData && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={quote.signatureData} alt="" className="h-10 w-28 rounded-md bg-white/[0.06] object-contain" />
          )}
          <span>
            <strong>{t("signedBy", { name: quote.signatureName, date: d(quote.acceptedAt) })}</strong>
            {quote.depositInvoiceId && <> · <Link href={`/invoices/${quote.depositInvoiceId}`} className="underline">{t("depositInvoiceLink", { percent: quote.depositPercent })}</Link></>}
          </span>
        </div>
      )}

      {quote.clientNote && (
        <div className="mb-6 rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
          <strong>{t("clientNoteTitle")}:</strong> {quote.clientNote}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between border-b border-white/[0.06] pb-4">
            <div>
              <p className="text-lg font-bold text-white">{quote.user.company?.name ?? quote.user.email}</p>
              <p className="text-sm text-slate-400">{decrypt(quote.user.company?.vatNumber) ?? ""}</p>
            </div>
            <div className="text-right">
              <QuoteStatusBadge status={quote.status} />
              <p className="mt-2 text-sm text-slate-400">{t("number")}: {quote.quoteNumber}</p>
              <p className="text-sm text-slate-400">{t("issueDate")}: {d(quote.issueDate)}</p>
              {quote.validUntil && <p className="text-sm text-slate-400">{t("validUntil")}: {d(quote.validUntil)}</p>}
            </div>
          </div>

          <div className="py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("customer")}</p>
            <p className="mt-1 font-medium text-white">{quote.customer.name}</p>
            {decrypt(quote.customer.address) && <p className="text-sm text-slate-400">{decrypt(quote.customer.address)}</p>}
            <p className="text-sm text-slate-400">{[quote.customer.postalCode, quote.customer.city].filter(Boolean).join(" ")}</p>
          </div>

          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
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
              {quote.lineItems.map((li) => (
                <tr key={li.id} className="border-b border-white/[0.04]">
                  <td className="py-2">
                    {li.description}
                    {li.clientAdded && <span className="ml-2 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-300">{t("clientAddedBadge")}</span>}
                  </td>
                  <td className="py-2 text-right">{Number(li.quantity)}</td>
                  <td className="py-2 text-right">{money(Number(li.unitPrice))}</td>
                  <td className="py-2 text-right">{Number(li.vatRate)}%</td>
                  <td className="py-2 text-right">{money(Number(li.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>

          <div className="mt-4 ml-auto w-56 text-sm">
            <div className="flex justify-between py-1 text-slate-400"><span>{t("subtotal")}</span><span>{money(Number(quote.subtotal))}</span></div>
            <div className="flex justify-between py-1 text-slate-400"><span>{t("vat")}</span><span>{money(Number(quote.vatAmount))}</span></div>
            <div className="mt-1 flex justify-between border-t border-white/[0.06] pt-2 text-base font-bold text-white"><span>{t("total")}</span><span>{money(Number(quote.total))}</span></div>
          </div>

          {quote.notes && (
            <div className="mt-6 border-t border-white/[0.06] pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("notes")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{quote.notes}</p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-1">
          <QuoteActions id={quote.id} status={quote.status} publicToken={quote.publicToken} convertedInvoiceId={quote.convertedInvoiceId} />
        </div>
      </div>
    </div>
  );
}
