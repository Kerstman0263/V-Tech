"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Icon } from "@/components/ui/Icon";
import { parseBankCsvRows } from "@/lib/bank-parse";

interface InvRef { id: string; invoiceNumber: string; total: number; customer: string }
interface Tx {
  id: string;
  date: string;
  amount: number;
  direction: "CREDIT" | "DEBIT";
  description: string;
  status: "UNMATCHED" | "MATCHED" | "IGNORED";
  suggested: InvRef | null;
  matched: InvRef | null;
}
interface OpenInvoice { id: string; invoiceNumber: string; customer: string }

export function BankManager() {
  const t = useTranslations("bank");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, locale);
  const fileRef = useRef<HTMLInputElement>(null);

  const [txs, setTxs] = useState<Tx[]>([]);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [tRes, iRes] = await Promise.all([fetch("/api/bank/transactions"), fetch("/api/invoices")]);
    if (tRes.ok) setTxs(await tRes.json());
    if (iRes.ok) {
      const inv = await iRes.json();
      setOpenInvoices(
        inv
          .filter((i: { status: string }) => i.status === "SENT" || i.status === "OVERDUE")
          .map((i: { id: string; invoiceNumber: string; customer: { name: string } }) => ({ id: i.id, invoiceNumber: i.invoiceNumber, customer: i.customer?.name ?? "" })),
      );
    }
  }, []);
  useEffect(() => { void load().catch(() => setError(t("loadError"))); }, [load, t]);

  function handleFile(file: File) {
    setError(null);
    setInfo(null);
    const reader = new FileReader();
    reader.onerror = () => setError(t("fileError"));
    reader.onload = async () => {
      const rows = parseBankCsvRows(String(reader.result ?? ""));
      if (!rows) { setError(t("csvError")); return; }
      setBusy(true);
      const res = await fetch("/api/bank/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: rows }),
      });
      setBusy(false);
      if (!res.ok) { setError(t("importError")); return; }
      const data = await res.json();
      setInfo(t("imported", { count: data.imported, suggested: data.suggested, duplicates: data.duplicates }));
      load();
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function requestAction(id: string, action: "confirm" | "ignore" | "unmatch", invoiceId?: string) {
    const res = await fetch(`/api/bank/transactions/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, invoiceId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(locale === "nl" && typeof data.error === "string" ? data.error : t("actionError"));
    }
  }
  async function act(id: string, action: "confirm" | "ignore" | "unmatch", invoiceId?: string) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(null); setInfo(null);
    try {
      await requestAction(id, action, invoiceId); await load();
      setInfo(t(action === "unmatch" ? "unmatchedNote" : "actionSaved"));
    } catch (error) { setError(error instanceof Error ? error.message : t("actionError")); }
    finally { actionLock.current = false; setBusy(false); }
  }
  const suggestions = txs.filter((t) => t.status === "UNMATCHED" && t.suggested);
  async function confirmAll() {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(null); setInfo(null);
    try {
      for (const suggestion of suggestions) await requestAction(suggestion.id, "confirm");
      setInfo(t("actionSaved"));
    } catch (error) { setError(error instanceof Error ? error.message : t("actionError")); }
    finally { actionLock.current = false; setBusy(false); await load().catch(() => setError(t("loadError"))); }
  }

  // KPI's
  const received = txs.filter((t) => t.direction === "CREDIT" && t.status !== "IGNORED").reduce((s, t) => s + t.amount, 0);
  const spent = txs.filter((t) => t.direction === "DEBIT" && t.status !== "IGNORED").reduce((s, t) => s + t.amount, 0);
  const matchedCount = txs.filter((t) => t.status === "MATCHED").length;

  // Groepeer per maand
  const groups = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const tx of txs) {
      const key = tx.date.slice(0, 7);
      (map.get(key) ?? map.set(key, []).get(key)!).push(tx);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [txs]);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI's */}
      <div data-tour="bank-kpis" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("kpiReceived")} value={money(received)} icon="euro" tone="green" />
        <StatCard label={t("kpiSpent")} value={money(spent)} icon="wallet" tone="rose" />
        <StatCard label={t("kpiMatched")} value={String(matchedCount)} icon="check-circle" tone="teal" />
        <div data-tour="bank-match">
          <StatCard label={t("kpiSuggested")} value={String(suggestions.length)} icon="zap" tone="amber" />
        </div>
      </div>

      {/* Import */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">{t("importTitle")}</h2>
            <p className="mt-1 text-sm text-slate-400">{t("importDesc")}</p>
          </div>
          {suggestions.length > 0 && (
            <Button onClick={confirmAll} disabled={busy}>
              <Icon name="check-circle" className="mr-1.5 inline h-4 w-4 align-[-2px]" />{t("confirmAll", { count: suggestions.length })}
            </Button>
          )}
        </div>
        <div
          data-tour="bank-import"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-brand-500 bg-brand-500/10" : "border-white/10 bg-white/[0.02] hover:border-brand-400/40 hover:bg-white/[0.04]",
          )}
        >
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name="download" className="h-6 w-6" /></span>
          <p className="mt-2 font-semibold text-slate-200">{t("dropTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("dropHint")}</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
        {busy && <p className="mt-3 text-sm text-slate-400">{t("busy")}</p>}
        {info && <p role="status" className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{info}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      </Card>

      {/* Transacties */}
      <div data-tour="bank-transactions">
      {txs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name="wallet" className="h-5 w-5" /></div>
          <p className="mt-3 text-sm text-slate-500">{t("empty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([key, items]) => {
            const monthLabel = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", { month: "long", year: "numeric" }).format(new Date(key + "-01"));
            return (
              <Card key={key} className="overflow-hidden">
                <div className="border-b border-white/[0.06] bg-white/[0.03] px-5 py-2.5">
                  <span className="text-sm font-semibold capitalize text-slate-300">{monthLabel}</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {items.map((tx) => (
                    <div key={tx.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("tabular text-sm font-semibold", tx.direction === "CREDIT" ? "text-emerald-400" : "text-rose-400")}>
                            {tx.direction === "CREDIT" ? "+" : "−"} {money(tx.amount)}
                          </span>
                          <span className="tabular text-xs text-slate-500">{tx.date}</span>
                        </div>
                        <p className="truncate text-xs text-slate-400">{tx.description}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {tx.status === "MATCHED" && tx.matched ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                              <Icon name="check" className="h-3 w-3" />{t("linkedTo", { number: tx.matched.invoiceNumber })}
                            </span>
                            <button disabled={busy} onClick={() => act(tx.id, "unmatch")} className="text-xs text-slate-500 hover:text-slate-300 hover:underline">{t("unmatch")}</button>
                          </>
                        ) : tx.status === "IGNORED" ? (
                          <span className="text-xs text-slate-600">{t("ignored")}</span>
                        ) : tx.suggested ? (
                          <>
                            <span className="hidden text-xs text-slate-400 sm:inline">{t("suggestion")}: <span className="font-medium text-brand-300">{tx.suggested.invoiceNumber}</span> · {tx.suggested.customer}</span>
                            <Button disabled={busy} onClick={() => act(tx.id, "confirm", tx.suggested!.id)} className="px-3 py-1.5 text-xs">{t("confirm")}</Button>
                            <button disabled={busy} onClick={() => act(tx.id, "ignore")} className="text-xs text-slate-500 hover:text-slate-300 hover:underline">{t("ignore")}</button>
                          </>
                        ) : tx.direction === "CREDIT" && openInvoices.length > 0 ? (
                          <select
                            aria-label={t("chooseInvoice")}
                            disabled={busy}
                            defaultValue=""
                            onChange={(e) => e.target.value && act(tx.id, "confirm", e.target.value)}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white outline-none focus:border-brand-500"
                          >
                            <option value="" disabled>{t("chooseInvoice")}</option>
                            {openInvoices.map((i) => (
                              <option key={i.id} value={i.id}>{i.invoiceNumber} · {i.customer}</option>
                            ))}
                          </select>
                        ) : (
                          <button disabled={busy} onClick={() => act(tx.id, "ignore")} className="text-xs text-slate-500 hover:text-slate-300 hover:underline">{t("ignore")}</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
