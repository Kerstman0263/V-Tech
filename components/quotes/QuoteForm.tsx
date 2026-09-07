"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ProductPicker } from "@/components/products/ProductPicker";
import { formatMoney } from "@/lib/utils";

interface Customer {
  id: string;
  name: string;
}

export interface QuoteDefaults {
  vatRate: number;
  validDays: number;
  notes: string;
  currency: string;
  previewNumber: string;
}

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function QuoteForm({ customers, defaults }: { customers: Customer[]; defaults: QuoteDefaults }) {
  const t = useTranslations("quotes");
  const router = useRouter();

  const today = new Date();
  const valid = new Date();
  valid.setDate(valid.getDate() + defaults.validDays);

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(isoDate(today));
  const [validUntil, setValidUntil] = useState(isoDate(valid));
  const [notes, setNotes] = useState(defaults.notes);
  const [depositPercent, setDepositPercent] = useState(0);
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unitPrice: 0, vatRate: defaults.vatRate }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const addLine = () =>
    setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, vatRate: defaults.vatRate }]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vat = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.vatRate / 100), 0);
  const total = subtotal + vat;
  const money = (n: number) => formatMoney(n, "nl", defaults.currency);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, issueDate, validUntil, notes, lineItems: lines, depositPercent }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("saveError"));
      return;
    }
    router.push("/quotes");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Kop */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label={t("customer")}
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">{t("number")}</label>
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-slate-400">
              {defaults.previewNumber}
            </div>
          </div>
          <Input type="date" label={t("issueDate")} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          <Input type="date" label={t("validUntil")} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">{t("depositLabel")}</label>
            <select value={depositPercent} onChange={(e) => setDepositPercent(Number(e.target.value))} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-500">
              {[0, 10, 25, 30, 50, 100].map((p) => <option key={p} value={p} className="bg-[#12112a]">{p === 0 ? t("depositNone") : `${p}%`}</option>)}
            </select>
            <p className="text-xs text-slate-500">{t("depositHint")}</p>
          </div>
        </div>
      </div>

      {/* Regels */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t("lineItems")}</h3>
          {/* Catalogus: één klik vult een regel met naam, prijs en btw */}
          <ProductPicker
            onPick={(p) =>
              setLines((prev) => [
                ...prev.filter((l) => l.description.trim() !== "" || l.unitPrice !== 0),
                { description: p.name, quantity: 1, unitPrice: p.unitPrice, vatRate: p.vatRate },
              ])
            }
          />
        </div>
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
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
              />
              <input
                type="number" step="0.01"
                className="tabular col-span-3 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-1"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
              />
              <input
                type="number" step="0.01"
                className="tabular col-span-4 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-2"
                value={line.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
              />
              <input
                type="number" step="1"
                className="tabular col-span-3 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-1"
                value={line.vatRate}
                onChange={(e) => updateLine(i, { vatRate: Number(e.target.value) })}
              />
              <div className="col-span-2 flex items-center justify-end gap-1 text-right text-sm font-medium md:col-span-2">
                {money(line.quantity * line.unitPrice)}
                <button type="button" onClick={() => removeLine(i)} className="ml-1 text-slate-600 hover:text-rose-500" aria-label="x">
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
          <label className="text-sm font-medium text-slate-300">{t("notes")}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500" />
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex justify-between py-1 text-sm text-slate-400"><span>{t("subtotal")}</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between py-1 text-sm text-slate-400"><span>{t("vat")}</span><span>{money(vat)}</span></div>
          <div className="mt-2 flex justify-between border-t border-white/[0.06] pt-2 text-base font-bold text-white"><span>{t("total")}</span><span>{money(total)}</span></div>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={saving || !customerId}>{saving ? "..." : t("create")}</Button>
      </div>
    </div>
  );
}
