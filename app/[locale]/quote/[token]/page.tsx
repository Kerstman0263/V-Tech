import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { formatMoney } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { QuoteRespond } from "@/components/quotes/QuoteRespond";
import { QuoteClientEdit } from "@/components/quotes/QuoteClientEdit";

/**
 * Publieke offerte-pagina (geen login) — dit is wat de KLANT van de
 * ondernemer ziet, dus een premium visitekaartje. Bereikbaar via de
 * onraadbare publicToken. Een verlopen offerte (validUntil voorbij) wordt
 * hier als verlopen getoond en kan niet meer worden geaccepteerd.
 */
export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("quotes");
  const locale = await getLocale();

  const quote = await db.quote.findUnique({
    where: { publicToken: token },
    include: { customer: { select: { name: true } }, lineItems: { orderBy: { position: "asc" } }, user: { include: { company: true } } },
  });
  if (!quote) notFound();

  const money = (n: number) => formatMoney(n, locale, quote.currency);
  const fmt = (date: Date) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
  const companyName = quote.user.company?.name ?? quote.user.email;

  // Geldigheid: dagen resterend; verlopen -> status EXPIRED voor de weergave.
  const now = new Date();
  const expired = (quote.status === "SENT" || quote.status === "DRAFT") && !!quote.validUntil && quote.validUntil < now;
  const status = expired ? "EXPIRED" : quote.status;
  const daysLeft = quote.validUntil ? Math.max(0, Math.ceil((quote.validUntil.getTime() - now.getTime()) / 86_400_000)) : null;
  const isOpen = status === "SENT" || status === "DRAFT";

  const ownLines = quote.lineItems.filter((li) => !li.clientAdded);
  const vatRates = [...new Set(ownLines.map((li) => Number(li.vatRate)))];

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0618] text-white">
      {/* Compacte kop: logo van de ondernemer of Saldova-merk */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {quote.user.company?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quote.user.company.logo} alt={companyName} className="h-10 w-auto object-contain" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-sm font-bold text-white">
                {companyName.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div>
              <p className="font-semibold">{companyName}</p>
              <p className="text-xs text-slate-500">{t("publicIntro", { company: companyName })}</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Logo className="h-4 w-4" />
            {t("poweredBy")}
          </span>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[600px] max-w-full -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />

        {/* Status- en geldigheidsbalk */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-300">{t("title")}</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{quote.quoteNumber}</h1>
          </div>
          {isOpen && daysLeft !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
              <Icon name="hourglass" className="h-3.5 w-3.5" />
              {daysLeft === 0 ? t("validLastDay") : t("validFor", { days: daysLeft })}
            </span>
          )}
          {status === "ACCEPTED" || status === "CONVERTED" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <Icon name="check-circle" className="h-3.5 w-3.5" />
              {t("status.accepted")}
            </span>
          ) : status === "DECLINED" ? (
            <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300">{t("status.declined")}</span>
          ) : status === "EXPIRED" ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-400">{t("status.expired")}</span>
          ) : null}
        </div>

        {/* Digitaal ondertekend */}
        {quote.signatureName && quote.acceptedAt && (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-4">
            {quote.signatureData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quote.signatureData} alt="" className="h-14 w-40 rounded-lg bg-white/[0.04] object-contain" />
            )}
            <div className="text-sm">
              <p className="font-semibold text-emerald-200">{t("signedBy", { name: quote.signatureName, date: fmt(quote.acceptedAt) })}</p>
              {quote.depositInvoiceId && <p className="text-emerald-100/70">{t("depositInvoiceCreated")}</p>}
            </div>
          </div>
        )}

        {/* De offerte zelf */}
        <div className="mt-6 overflow-hidden rounded-3xl border border-[#a855f7]/20 bg-[#16102E] shadow-[0_0_50px_-16px_rgba(124,58,237,0.45)]">
          <div className="grid gap-4 border-b border-white/[0.06] p-6 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("forCustomer")}</p>
              <p className="mt-1 text-lg font-bold">{quote.customer.name}</p>
            </div>
            <div className="text-sm text-slate-400 sm:text-right">
              <p>
                {t("issueDate")}: <span className="text-slate-200">{fmt(quote.issueDate)}</span>
              </p>
              {quote.validUntil && (
                <p>
                  {t("validUntil")}: <span className="text-slate-200">{fmt(quote.validUntil)}</span>
                </p>
              )}
              {decrypt(quote.user.company?.vatNumber) && <p className="mt-1 text-xs text-slate-500">{t("vatNumberLabel")}: {decrypt(quote.user.company?.vatNumber)}</p>}
            </div>
          </div>

          <div className="p-6">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="pb-2">{t("description")}</th>
                  <th className="pb-2 text-right">{t("quantity")}</th>
                  <th className="pb-2 text-right">{t("unitPrice")}</th>
                  <th className="pb-2 text-right">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {ownLines.map((li) => (
                  <tr key={li.id} className="border-t border-white/[0.05]">
                    <td className="py-3 text-slate-200">{li.description}</td>
                    <td className="tabular py-3 text-right text-slate-400">{Number(li.quantity)}</td>
                    <td className="tabular py-3 text-right text-slate-400">{money(Number(li.unitPrice))}</td>
                    <td className="tabular py-3 text-right font-medium text-white">{money(Number(li.lineTotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 ml-auto w-full max-w-xs text-sm">
              <div className="flex justify-between py-1 text-slate-400">
                <span>{t("subtotal")}</span>
                <span className="tabular">{money(Number(quote.subtotal))}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-400">
                <span>
                  {t("vat")}
                  {vatRates.length === 1 ? ` (${vatRates[0]}%)` : ""}
                </span>
                <span className="tabular">{money(Number(quote.vatAmount))}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between rounded-xl bg-gradient-to-r from-brand-500/20 to-fuchsia-500/10 px-4 py-3">
                <span className="text-sm font-semibold text-brand-200">{t("totalIncl")}</span>
                <span className="tabular text-2xl font-extrabold text-white">{money(Number(quote.total))}</span>
              </div>
            </div>

            {quote.notes && (
              <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("noteFromCompany")}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{quote.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <QuoteClientEdit
            token={token}
            editable={isOpen}
            currency={quote.currency}
            locale={locale}
            initialItems={quote.lineItems
              .filter((li) => li.clientAdded)
              .map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPrice: Number(li.unitPrice) }))}
            initialNote={quote.clientNote ?? ""}
          />
        </div>

        <div className="mt-6">
          <QuoteRespond token={token} initialStatus={status} depositPercent={quote.depositPercent} depositAmount={Math.round(Number(quote.subtotal) * quote.depositPercent) / 100 * (1 + (vatRates.length === 1 ? vatRates[0] : 21) / 100)} money={money} />
        </div>

        <p className="mt-8 text-center text-xs text-slate-600">{t("publicFooter", { company: companyName })}</p>
      </main>
    </div>
  );
}
