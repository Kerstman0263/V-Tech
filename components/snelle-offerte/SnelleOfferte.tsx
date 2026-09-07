"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatCard } from "@/components/ui/StatCard";
import { QuoteStatusBadge } from "@/components/ui/StatusBadge";
import { ProductPicker } from "@/components/products/ProductPicker";

type Status = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CONVERTED";
type VatRate = 0 | 9 | 21;
type Validity = 7 | 14 | 30;

interface QuoteRow {
  id: string;
  quoteNumber: string;
  status: Status;
  total: string;
  publicToken: string;
  createdAt: string;
  validUntil: string | null;
  clientNote: string | null;
  convertedInvoiceId: string | null;
  customer: { name: string };
  _count?: { lineItems: number };
}

interface GenResult {
  id: string;
  quoteNumber: string;
  publicToken: string;
}

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
}

const INPUT =
  "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Snelle Offerte — in een minuut een deelbare offerte-link.
 * Klantnaam (met autocomplete uit je klanten), regels met één btw-tarief,
 * geldigheid, optioneel bericht; daarna delen via link, WhatsApp of e-mail.
 * De lijst ververst live zodat een acceptatie direct zichtbaar is.
 */
export function SnelleOfferte({ locale = "nl", kor = false }: { locale?: string; kor?: boolean }) {
  const t = useTranslations("snelleOfferte");
  const [customerName, setCustomerName] = useState("");
  const [customers, setCustomers] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [vatRate, setVatRate] = useState<VatRate>(kor ? 0 : 21);
  const [validity, setValidity] = useState<Validity>(14);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [converting, setConverting] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, locale, "EUR");
  const linkOf = (token: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/quote/${token}` : `/quote/${token}`;
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));

  const load = useCallback(async () => {
    const res = await fetch("/api/quotes");
    if (res.ok) setQuotes((await res.json()).slice(0, 10));
  }, []);

  // Eerste keer laden + live verversen (zodat geaccepteerd direct verschijnt)
  useEffect(() => {
    load();
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { name: string }[]) => setCustomers(list.map((c) => c.name)))
      .catch(() => {});
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, 5000);
    return () => clearInterval(id);
  }, [load]);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const addLine = () => setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vat = subtotal * (vatRate / 100);
  const total = subtotal + vat;
  const valid = customerName.trim() !== "" && subtotal > 0 && lines.every((l) => l.description.trim() !== "");

  // KPI's over de lijst
  const stats = useMemo(() => {
    const open = quotes.filter((q) => q.status === "SENT").length;
    const won = quotes.filter((q) => q.status === "ACCEPTED" || q.status === "CONVERTED");
    const decided = won.length + quotes.filter((q) => q.status === "DECLINED" || q.status === "EXPIRED").length;
    return {
      open,
      won: won.length,
      wonValue: won.reduce((s, q) => s + Number(q.total), 0),
      rate: decided > 0 ? Math.round((won.length / decided) * 100) : null,
    };
  }, [quotes]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setCopied(null);
    const res = await fetch("/api/quotes/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName, lineItems: lines, vatRate, validityDays: validity, notes: note || undefined }),
    });
    setGenerating(false);
    if (!res.ok) {
      setError(t("error"));
      return;
    }
    setResult(await res.json());
    load();
  }

  function resetForm() {
    setResult(null);
    setCustomerName("");
    setLines([{ description: "", quantity: 1, unitPrice: 0 }]);
    setNote("");
    setShowNote(false);
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkOf(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard geblokkeerd — de link staat ook leesbaar in het veld */
    }
  }

  const shareText = (q: { quoteNumber: string; customer?: string }, token: string) =>
    t("shareMessage", { name: q.customer ?? "", number: q.quoteNumber, link: linkOf(token) });
  const waHref = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
  const mailHref = (subject: string, text: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  async function convert(id: string) {
    setConverting(id);
    const res = await fetch(`/api/quotes/${id}/convert`, { method: "POST" });
    setConverting(null);
    if (res.ok) load();
  }

  const pill = (active: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200",
      active ? "border-brand-500/40 bg-brand-500/15 text-brand-200 shadow-glow" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
    );

  return (
    <div className="flex flex-col gap-6">
      {/* KPI's */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("kpiOpen")} value={String(stats.open)} icon="send" tone="amber" />
        <StatCard label={t("kpiAccepted")} value={String(stats.won)} icon="check-circle" tone="green" />
        <StatCard label={t("kpiValue")} value={money(stats.wonValue)} icon="euro" tone="brand" />
        <StatCard label={t("kpiConversion")} value={stats.rate === null ? "—" : `${stats.rate}%`} icon="trend" tone="teal" />
      </div>

      {/* 1. Invoerformulier */}
      <div data-tour="snelle-offerte-form">
        <Card className="relative overflow-hidden p-6">
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-500/15 blur-3xl" />
          <div className="relative">
            <h2 className="font-semibold text-white">{t("formTitle")}</h2>
            <p className="mt-1 text-sm text-slate-400">{t("formSub")}</p>

            <form onSubmit={generate} className="mt-5 flex flex-col gap-5">
              <div>
                <Input
                  label={t("customerName")}
                  list="snelle-offerte-customers"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t("customerNamePlaceholder")}
                  required
                  autoComplete="off"
                />
                <datalist id="snelle-offerte-customers">
                  {customers.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Regels */}
              <div data-tour="snelle-offerte-lines" className="flex flex-col gap-2">
                <div className="flex justify-end">
                  {/* Catalogus: één klik vult een regel met naam en prijs */}
                  <ProductPicker
                    onPick={(p) =>
                      setLines((prev) => [
                        ...prev.filter((l) => l.description.trim() !== "" || l.unitPrice !== 0),
                        { description: p.name, quantity: 1, unitPrice: p.unitPrice },
                      ])
                    }
                  />
                </div>
                <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
                  <span className="col-span-7">{t("description")}</span>
                  <span className="col-span-2 text-right">{t("quantity")}</span>
                  <span className="col-span-3 text-right">{t("unitPrice")}</span>
                </div>
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2">
                    <input
                      placeholder={t("descriptionPlaceholder")}
                      className={cn(INPUT, "col-span-12 sm:col-span-7")}
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className={cn(INPUT, "tabular col-span-5 text-right sm:col-span-2")}
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                    />
                    <div className="col-span-7 flex items-center gap-1 sm:col-span-3">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">€</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={cn(INPUT, "tabular w-full pl-6 text-right")}
                          value={line.unitPrice}
                          onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                        aria-label={t("removeLine")}
                      >
                        <Icon name="x-circle" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="secondary" className="mt-1 self-start" onClick={addLine}>
                  <Icon name="plus" className="mr-1 h-4 w-4" />
                  {t("addLine")}
                </Button>
              </div>

              {/* Btw + geldigheid */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-slate-300">{t("vatRate")}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {([21, 9, 0] as VatRate[]).map((r) => (
                      <button key={r} type="button" onClick={() => setVatRate(r)} className={pill(vatRate === r)}>
                        {r}%
                      </button>
                    ))}
                  </div>
                  {kor && <p className="mt-1.5 text-xs text-slate-500">{t("vatKorHint")}</p>}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">{t("validity")}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {([7, 14, 30] as Validity[]).map((d) => (
                      <button key={d} type="button" onClick={() => setValidity(d)} className={pill(validity === d)}>
                        {t("validityDays", { days: d })}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Optioneel bericht */}
              {showNote ? (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-300">{t("noteLabel")}</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder={t("notePlaceholder")}
                    className={INPUT}
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setShowNote(true)} className="self-start text-sm font-medium text-brand-300 transition-colors hover:text-brand-200">
                  + {t("noteToggle")}
                </button>
              )}

              {/* Totalen */}
              <div className="ml-auto w-full max-w-xs rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm">
                <div className="flex justify-between py-0.5 text-slate-400">
                  <span>{t("subtotal")}</span>
                  <span className="tabular">{money(subtotal)}</span>
                </div>
                <div className="flex justify-between py-0.5 text-slate-400">
                  <span>{t("vatLine", { rate: vatRate })}</span>
                  <span className="tabular">{money(vat)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-white/10 pt-2 text-base font-bold text-white">
                  <span>{t("total")}</span>
                  <span className="tabular">{money(total)}</span>
                </div>
              </div>

              <div data-tour="snelle-offerte-generate" className="flex flex-col">
                <Button type="submit" className="py-3 text-base" disabled={generating || !valid}>
                  <Icon name="zap" className="mr-2 h-4 w-4" />
                  {generating ? t("generating") : t("generate")}
                </Button>
              </div>
            </form>

            {error && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            )}

            {/* Gegenereerde deellink */}
            {result && (
              <div className="mt-5 rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/15 to-fuchsia-500/5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-white">
                      <Icon name="check-circle" className="h-5 w-5 text-emerald-400" />
                      {t("ready")} <span className="text-brand-300">{result.quoteNumber}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{t("readyHint")}</p>
                  </div>
                  <button type="button" onClick={resetForm} className="shrink-0 text-xs font-medium text-slate-400 transition-colors hover:text-white">
                    {t("newQuote")}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input readOnly value={linkOf(result.publicToken)} className={cn(INPUT, "min-w-0 flex-1 truncate")} onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" onClick={() => copy(result.publicToken)}>
                    {copied === result.publicToken ? t("copied") : t("copy")}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={waHref(shareText({ quoteNumber: result.quoteNumber, customer: customerName }, result.publicToken))}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                  >
                    <Icon name="chat" className="h-4 w-4" />
                    {t("whatsapp")}
                  </a>
                  <a
                    href={mailHref(t("shareSubject", { number: result.quoteNumber }), shareText({ quoteNumber: result.quoteNumber, customer: customerName }, result.publicToken))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]"
                  >
                    <Icon name="mail" className="h-4 w-4" />
                    {t("email")}
                  </a>
                  <a
                    href={linkOf(result.publicToken)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]"
                  >
                    {t("open")}
                  </a>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 2. Mijn Snelle Offertes */}
      <div data-tour="snelle-offerte-list">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
            <h2 className="font-semibold text-white">{t("listTitle")}</h2>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {t("live")}
            </span>
          </div>
          {quotes.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">{t("listEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <tbody>
                  {quotes.map((q) => {
                    const additions = q._count?.lineItems ?? 0;
                    const hasClientInput = additions > 0 || !!q.clientNote;
                    return (
                      <tr key={q.id} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]">
                        <td className="px-5 py-3">
                          <p className="font-medium text-white">{q.customer.name}</p>
                          <p className="text-xs text-slate-500">
                            <span className="text-brand-300">{q.quoteNumber}</span> · {fmtDate(q.createdAt)}
                            {q.validUntil && q.status === "SENT" && <> · {t("validUntilShort", { date: fmtDate(q.validUntil) })}</>}
                          </p>
                        </td>
                        <td className="tabular px-5 py-3 text-right font-medium text-white">{money(Number(q.total))}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <QuoteStatusBadge status={q.status} />
                            {hasClientInput && (
                              <span
                                title={q.clientNote ?? undefined}
                                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
                              >
                                <Icon name="chat" className="h-3 w-3" />
                                {additions > 0 ? t("clientAdditions", { count: additions }) : t("clientNoteTag")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {q.status === "ACCEPTED" && (
                              <button
                                onClick={() => convert(q.id)}
                                disabled={converting === q.id}
                                className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-glow transition-all hover:bg-brand-500 disabled:opacity-50"
                              >
                                {converting === q.id ? "…" : t("convert")}
                              </button>
                            )}
                            {q.status === "CONVERTED" && q.convertedInvoiceId && (
                              <Link href={`/invoices/${q.convertedInvoiceId}`} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-white/[0.06]">
                                {t("viewInvoice")}
                              </Link>
                            )}
                            <a
                              href={waHref(shareText({ quoteNumber: q.quoteNumber, customer: q.customer.name }, q.publicToken))}
                              target="_blank"
                              rel="noreferrer"
                              title={t("whatsapp")}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
                            >
                              <Icon name="chat" className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => copy(q.publicToken)}
                              title={t("copyLink")}
                              className="flex h-8 items-center justify-center rounded-lg px-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                              {copied === q.publicToken ? t("copied") : t("copyLink")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
