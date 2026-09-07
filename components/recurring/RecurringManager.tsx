"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { ProductPicker } from "@/components/products/ProductPicker";

type Interval = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

interface Customer {
  id: string;
  name: string;
  email: string | null;
}

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

interface Recurring {
  id: string;
  interval: Interval;
  nextRunAt: string;
  lastRunAt: string | null;
  active: boolean;
  autoSend: boolean;
  notes: string | null;
  runCount: number;
  total: number;
  lineCount: number;
  customer: { name: string; email: string | null };
}

const INPUT =
  "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

// Hoeveel termijnen per jaar — voor de "per maand"-KPI
const PER_YEAR: Record<Interval, number> = { WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1 };

/**
 * Periodieke facturen: sjablonen die op de gekozen datum automatisch een
 * echte factuur worden (dagelijkse cron). Handmatig "nu aanmaken" kan ook.
 */
export function RecurringManager({ customers, defaultVat = 21, locale = "nl" }: { customers: Customer[]; defaultVat?: number; locale?: string }) {
  const t = useTranslations("recurring");
  const [items, setItems] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ id: string; number: string; invoiceId: string } | null>(null);

  // Formulier
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [interval, setInterval_] = useState<Interval>("MONTHLY");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoSend, setAutoSend] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unitPrice: 0, vatRate: defaultVat }]);

  const money = (n: number) => formatMoney(n, locale, "EUR");
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

  const load = useCallback(async () => {
    const res = await fetch("/api/recurring");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = items.filter((i) => i.active);
    const monthly = active.reduce((s, i) => s + (i.total * PER_YEAR[i.interval]) / 12, 0);
    const next = active.map((i) => i.nextRunAt).sort()[0] ?? null;
    return { active: active.length, monthly, next };
  }, [items]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate / 100), 0);
  const valid = customerId && lines.every((l) => l.description.trim() !== "") && subtotal > 0;

  const updateLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const addLine = (line?: Line) => setLines((prev) => [...prev.filter((l) => l.description.trim() !== "" || l.unitPrice !== 0 || prev.length === 1 && !line), line ?? { description: "", quantity: 1, unitPrice: 0, vatRate: defaultVat }]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, interval, startDate, autoSend, notes: notes || undefined, lineItems: lines }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("saveError"));
      return;
    }
    setCreating(false);
    setLines([{ description: "", quantity: 1, unitPrice: 0, vatRate: defaultVat }]);
    setNotes("");
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/recurring/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    load();
  }
  async function runNow(r: Recurring) {
    if (!confirm(t("runConfirm", { name: r.customer.name }))) return;
    setBusy(r.id);
    const res = await fetch(`/api/recurring/${r.id}/run`, { method: "POST" });
    setBusy(null);
    if (res.ok) {
      const data = await res.json();
      setLastRun({ id: r.id, number: data.invoiceNumber, invoiceId: data.invoiceId });
      load();
    }
  }
  async function remove(r: Recurring) {
    if (!confirm(t("removeConfirm", { name: r.customer.name }))) return;
    setBusy(r.id);
    await fetch(`/api/recurring/${r.id}`, { method: "DELETE" });
    setBusy(null);
    load();
  }

  const intervalOptions = (["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as Interval[]).map((v) => ({ value: v, label: t(`interval.${v}`) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("kpiActive")} value={String(stats.active)} icon="calendar" tone="brand" />
        <StatCard label={t("kpiMonthly")} value={money(stats.monthly)} icon="trend" tone="green" sub={t("kpiMonthlySub")} />
        <StatCard label={t("kpiNext")} value={stats.next ? fmtDate(stats.next) : "—"} icon="clock" tone="amber" />
      </div>

      {lastRun && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span>
            <Icon name="check-circle" className="mr-1.5 inline h-4 w-4 align-[-2px]" />
            {t("ranNow", { number: lastRun.number })}
          </span>
          <Link href={`/invoices/${lastRun.invoiceId}`} className="font-semibold underline">{t("viewInvoice")}</Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">{t("intro")}</p>
        {!creating && (
          <Button onClick={() => setCreating(true)} disabled={customers.length === 0}>
            <Icon name="plus" className="mr-1 h-4 w-4" />
            {t("new")}
          </Button>
        )}
      </div>
      {customers.length === 0 && <p className="text-sm text-amber-300">{t("noCustomers")}</p>}

      {creating && (
        <form onSubmit={create} className="rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select label={t("customer")} value={customerId} onChange={setCustomerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
            <Select label={t("intervalLabel")} value={interval} onChange={(v) => setInterval_(v as Interval)} options={intervalOptions} />
            <Input type="date" label={t("firstDate")} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
              <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="accent-brand-500" />
              {t("autoSend")}
            </label>
          </div>
          {autoSend && !customers.find((c) => c.id === customerId)?.email && <p className="mt-2 text-xs text-amber-300">{t("autoSendNoEmail")}</p>}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-white">{t("lines")}</h3>
            <ProductPicker onPick={(p) => addLine({ description: p.name, quantity: 1, unitPrice: p.unitPrice, vatRate: p.vatRate })} />
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <input placeholder={t("description")} className={cn(INPUT, "col-span-12 md:col-span-6")} value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                <input type="number" step="0.01" min="0" className={cn(INPUT, "tabular col-span-3 text-right md:col-span-1")} value={line.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                <input type="number" step="0.01" min="0" className={cn(INPUT, "tabular col-span-4 text-right md:col-span-2")} value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
                <input type="number" step="1" min="0" max="100" className={cn(INPUT, "tabular col-span-3 text-right md:col-span-1")} value={line.vatRate} onChange={(e) => updateLine(i, { vatRate: Number(e.target.value) })} />
                <div className="col-span-2 flex items-center justify-end gap-1 text-right text-sm font-medium text-white md:col-span-2">
                  <span className="tabular">{money(line.quantity * line.unitPrice)}</span>
                  <button type="button" onClick={() => removeLine(i)} className="ml-1 text-slate-600 hover:text-rose-400" aria-label={t("removeLine")}>
                    <Icon name="x-circle" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" className="self-start" onClick={() => addLine()}>
              + {t("addLine")}
            </Button>
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium text-slate-300">{t("notes")}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(INPUT, "mt-1 w-full")} placeholder={t("notesPlaceholder")} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              {t("perTerm")}: <span className="tabular font-semibold text-white">{money(total)}</span> <span className="text-slate-500">({t("inclVat")})</span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={saving || !valid}>{saving ? "…" : t("save")}</Button>
            </div>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p>}
        </form>
      )}

      {loading ? (
        <div className="skeleton h-40 rounded-2xl" aria-hidden />
      ) : items.length === 0 ? (
        !creating && <EmptyState icon="calendar" title={t("empty")} description={t("emptyHint")} action={customers.length > 0 ? <Button onClick={() => setCreating(true)}>{t("new")}</Button> : undefined} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white/[0.03] text-left text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("customer")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("intervalLabel")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("nextDate")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("perTerm")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("status")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className={cn("border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]", !r.active && "opacity-60")}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-white">{r.customer.name}</p>
                      <p className="text-xs text-slate-500">
                        {t("lineCount", { count: r.lineCount })}
                        {r.runCount > 0 && <> · {t("runCount", { count: r.runCount })}</>}
                        {r.autoSend && <> · {t("autoSendShort")}</>}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-slate-300">{t(`interval.${r.interval}`)}</td>
                    <td className="px-5 py-3 text-slate-300">{fmtDate(r.nextRunAt)}</td>
                    <td className="tabular px-5 py-3 text-right font-medium text-white">{money(r.total)}</td>
                    <td className="px-5 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", r.active ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-400")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", r.active ? "bg-emerald-400" : "bg-slate-500")} />
                        {r.active ? t("active") : t("paused")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => runNow(r)} disabled={busy === r.id} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-50">{t("runNow")}</button>
                        <button onClick={() => patch(r.id, { active: !r.active })} disabled={busy === r.id} className="text-xs font-medium text-slate-400 hover:text-white">{r.active ? t("pause") : t("resume")}</button>
                        <button onClick={() => remove(r)} disabled={busy === r.id} className="text-xs font-medium text-rose-400 hover:underline">{t("remove")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
