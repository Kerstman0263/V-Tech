"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ProductPicker } from "@/components/products/ProductPicker";
import { formatMoney } from "@/lib/utils";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";

interface Customer {
  id: string;
  name: string;
}

export interface InvoiceDefaults {
  vatRate: number;
  kor?: boolean;
  dueDays: number;
  notes: string;
  currency: string;
  previewNumber: string;
}

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  timeEntryId?: string;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function InvoiceForm({
  customers,
  defaults,
}: {
  customers: Customer[];
  defaults: InvoiceDefaults;
}) {
  const t = useTranslations("invoices");
  const router = useRouter();

  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + defaults.dueDays);

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(isoDate(today));
  const [dueDate, setDueDate] = useState(isoDate(due));
  const [notes, setNotes] = useState(defaults.notes);
  const [lines, setLines] = useState<Line[]>([
    { description: "", quantity: 1, unitPrice: 0, vatRate: defaults.vatRate },
  ]);
  const timeEntryIds = lines.flatMap((line) => line.timeEntryId ? [line.timeEntryId] : []);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Haalt openstaande uren van de gekozen klant op en voegt ze als regels toe.
  async function importHours() {
    if (!customerId || importing) return;
    setImporting(true); setImportMsg(null);
    try {
      const res = await fetch(`/api/time-entries?status=OPEN&customerId=${encodeURIComponent(customerId)}`);
      if (!res.ok) throw new Error("hours_unavailable");
      const entries: { id: string; description: string; hours: number; hourlyRate: number | null; approval: string; invoiceId: string | null }[] = await res.json();
      const eligible = entries.filter((e) => !e.invoiceId && ["APPROVED", "NOT_REQUIRED"].includes(e.approval) && !timeEntryIds.includes(e.id));
      if (!eligible.length) { setImportMsg(t("noOpenHours")); return; }
      setLines((prev) => [...prev.filter((l) => l.description.trim() !== "" || l.unitPrice !== 0), ...eligible.map((e) => ({
        description: e.description, quantity: Number(e.hours), unitPrice: Number(e.hourlyRate ?? 0), vatRate: defaults.vatRate, timeEntryId: e.id,
      }))]);
      setImportMsg(t("hoursImported", { count: eligible.length }));
    } catch { setError(t("connectionFailed")); } finally { setImporting(false); }
  }

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const addLine = () =>
    setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, vatRate: defaults.vatRate }]);

  let totals;
  try { totals = calculateInvoiceTotals(lines); } catch { totals = null; }
  const invalidTotal = !totals || Math.abs(totals.total) > 99_999_999.99;
  totals ??= calculateInvoiceTotals([]);
  const { subtotal, vatAmount: vat, total } = totals;
  const money = (n: number) => formatMoney(n, "nl", defaults.currency);

  async function submit() {
    if (saving || invalidTotal) return;
    setSaving(true);
    setError(null);
    try {
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, issueDate, dueDate, notes, lineItems: lines, timeEntryIds }),
    });
    setSaving(false);
    if (!res.ok) {
      // 402 = plan-limiet: toon de uitleg van de server (met upgrade-advies).
      const data = res.status === 402 ? await res.json().catch(() => ({})) : {};
      setError(typeof data.error === "string" ? data.error : t("saveError"));
      return;
    }
    router.push("/invoices");
    router.refresh();
    } catch { setError(t("saveError")); } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Kop: klant, nummer, data */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label={t("customer")}
            value={customerId}
            onChange={(value) => {
              setCustomerId(value); setImportMsg(null);
              setLines((prev) => { const kept = prev.filter((line) => !line.timeEntryId); return kept.length ? kept : [{ description: "", quantity: 1, unitPrice: 0, vatRate: defaults.vatRate }]; });
            }}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">{t("number")}</label>
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-slate-400">
              {defaults.previewNumber}
            </div>
          </div>
          <Input type="date" label={t("issueDate")} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          <Input type="date" label={t("dueDate")} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        {defaults.kor && (
          <p className="mt-4 rounded-xl border border-brand-500/20 bg-brand-500/[0.08] px-3 py-2 text-xs text-brand-200">
            {t("korActive")}
          </p>
        )}
      </div>

      {/* Regels */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t("lineItems")}</h3>
          <div className="flex flex-wrap items-center gap-2">
          {/* Catalogus: één klik vult een regel met naam, prijs en btw */}
          <ProductPicker
            onPick={(p) =>
              setLines((prev) => [
                ...prev.filter((l) => l.description.trim() !== "" || l.unitPrice !== 0),
                { description: p.name, quantity: 1, unitPrice: p.unitPrice, vatRate: p.vatRate },
              ])
            }
          />
          <button
            type="button"
            onClick={importHours}
            disabled={importing || !customerId}
            className="rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-500/20 disabled:opacity-50"
          >
            {importing ? "..." : t("importHours")}
          </button>
          </div>
        </div>
        {importMsg && <p className="mb-2 text-xs text-slate-400">{importMsg}</p>}
        <div className="hidden grid-cols-12 gap-2 px-1 pb-1 text-xs font-medium text-slate-500 md:grid">
          <span className="col-span-6">{t("description")}</span>
          <span className="col-span-1 text-right">{t("quantity")}</span>
          <span className="col-span-2 text-right">{t("unitPrice")}</span>
          <span className="col-span-1 text-right">{t("vatRate")}</span>
          <span className="col-span-2 text-right">{t("total")}</span>
        </div>
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <input
                placeholder={t("description")}
                className="col-span-12 rounded-lg border border-white/10 px-3 py-2 text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-6"
                aria-label={t("description") + " " + (i + 1)}
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
              />
              <input
                type="number" step="0.01"
                className="tabular col-span-3 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-1"
                aria-label={t("quantity") + " " + (i + 1)}
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
              />
              <input
                type="number" step="0.01"
                className="tabular col-span-4 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-2"
                aria-label={t("unitPrice") + " " + (i + 1)}
                value={line.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
              />
              <input
                type="number" step="1"
                className="tabular col-span-3 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-1"
                aria-label={t("vatRate") + " " + (i + 1)}
                value={line.vatRate}
                onChange={(e) => updateLine(i, { vatRate: Number(e.target.value) })}
              />
              <div className="col-span-2 flex items-center justify-end gap-1 text-right text-sm font-medium md:col-span-2">
                {money(totals.lineItems[i]?.lineTotal ?? 0)}
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="ml-1 text-slate-600 hover:text-rose-500"
                  aria-label="x"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-3" onClick={addLine} type="button">
          + {t("addLine")}
        </Button>
      </div>

      {/* Notities + totalen */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="invoice-notes" className="text-sm font-medium text-slate-300">{t("notes")}</label>
          <textarea
            id="invoice-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500"
          />
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex justify-between py-1 text-sm text-slate-400">
            <span>{t("subtotal")}</span><span>{money(subtotal)}</span>
          </div>
          <div className="flex justify-between py-1 text-sm text-slate-400">
            <span>{t("vat")}</span><span>{money(vat)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-white/[0.06] pt-2 text-base font-bold text-white">
            <span>{t("total")}</span><span>{money(total)}</span>
          </div>
        </div>
      </div>

      {invalidTotal && <p role="alert" className="text-sm text-rose-200">{t("amountTooLarge")}</p>}
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={invalidTotal || saving || !customerId}>
          {saving ? "..." : t("create")}
        </Button>
      </div>
    </div>
  );
}
