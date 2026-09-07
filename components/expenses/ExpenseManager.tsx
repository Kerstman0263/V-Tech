"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReceiptScanner } from "@/components/expenses/ReceiptScanner";
import { InboxPanel, type InboxItemSummary } from "@/components/expenses/InboxPanel";
import { useTranslations, useLocale } from "next-intl";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { EXPENSE_CATEGORIES } from "@/lib/validations/expense";

type Category = (typeof EXPENSE_CATEGORIES)[number];

interface Expense {
  id: string;
  date: string;
  vendor: string;
  description: string | null;
  category: Category;
  amountGross: number;
  vatRate: number;
  vatAmount: number;
  receipt: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const quarterOf = (dateStr: string) => Math.ceil(Number(dateStr.slice(5, 7)) / 3);

export function ExpenseManager() {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const nowYear = new Date().getFullYear();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [year, setYear] = useState(nowYear);
  const [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0); // 0 = hele jaar
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);
  // Bonnetjes-inbox: item dat nu verwerkt wordt (na opslaan gekoppeld aan de uitgave)
  const [inboxItemId, setInboxItemId] = useState<string | null>(null);
  const [inboxRefresh, setInboxRefresh] = useState(0);

  const emptyForm = { date: todayStr(), vendor: "", description: "", category: "OTHER" as Category, amountGross: "", vatRate: "21", receipt: null as string | null };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    const res = await fetch(`/api/expenses?year=${year}`);
    if (res.ok) setExpenses(await res.json());
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => (quarter === 0 ? expenses : expenses.filter((e) => quarterOf(e.date) === quarter)),
    [expenses, quarter],
  );
  const totalGross = filtered.reduce((s, e) => s + e.amountGross, 0);
  const totalVat = filtered.reduce((s, e) => s + e.vatAmount, 0);

  function onFile(file: File | null) {
    setError(null);
    if (!file) return setForm((f) => ({ ...f, receipt: null }));
    if (!file.type.startsWith("image/")) return setError(t("receiptTypeError"));
    if (file.size > 1_800_000) return setError(t("receiptSizeError"));
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, receipt: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  function startAdd() {
    setEditingId(null);
    setInboxItemId(null);
    setForm(emptyForm);
    setOpen(true);
  }
  // Inbox-item verwerken: formulier vooringevuld met de foto (OCR start daar) — PDF's alleen als koppeling.
  function startFromInbox(item: InboxItemSummary & { data: string }) {
    setEditingId(null);
    setInboxItemId(item.id);
    setError(null);
    setForm({ ...emptyForm, description: item.subject ?? "", receipt: item.mimeType.startsWith("image/") ? item.data : null });
    setOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startEdit(e: Expense) {
    setEditingId(e.id);
    setForm({ date: e.date, vendor: e.vendor, description: e.description ?? "", category: e.category, amountGross: String(e.amountGross), vatRate: String(e.vatRate), receipt: e.receipt });
    setOpen(true);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      date: form.date,
      vendor: form.vendor,
      description: form.description || undefined,
      category: form.category,
      amountGross: Number(form.amountGross),
      vatRate: Number(form.vatRate),
      receipt: form.receipt,
    };
    const res = await fetch(editingId ? `/api/expenses/${editingId}` : "/api/expenses", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? t("errorGeneric"));
      return;
    }
    // Verwerkt inbox-item koppelen aan de nieuwe uitgave
    if (!editingId && inboxItemId) {
      const created = await res.json().catch(() => null);
      await fetch(`/api/inbox/${inboxItemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "PROCESSED", expenseId: created?.id }) });
      setInboxItemId(null);
      setInboxRefresh((n) => n + 1);
    }
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    load();
  }

  async function remove(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    load();
  }

  const years = [nowYear - 1, nowYear, nowYear + 1].filter((y) => y <= nowYear);

  return (
    <div className="flex flex-col gap-5">
      {/* KPI's over de huidige selectie */}
      <div data-tour="expenses-kpis" className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("kpiTotal")} value={formatMoney(totalGross, locale)} icon="receipt" tone="brand" sub={quarter === 0 ? String(year) : `Q${quarter} ${year}`} />
        <StatCard label={t("kpiVat")} value={formatMoney(totalVat, locale)} icon="euro" tone="green" sub={t("kpiVatSub")} />
        <StatCard label={t("kpiCount")} value={String(filtered.length)} icon="folder" tone="teal" />
      </div>

      {/* Bonnetjes-inbox (per e-mail binnengekomen bijlagen) */}
      <InboxPanel onProcess={startFromInbox} refreshKey={inboxRefresh} />

      {/* Filters + nieuw */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(year)}
          onChange={(v) => setYear(Number(v))}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
        <div data-tour="expenses-filter" className="flex gap-1">
          {([0, 1, 2, 3, 4] as const).map((q) => (
            <button
              key={q}
              onClick={() => setQuarter(q)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium",
                quarter === q ? "bg-brand-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10",
              )}
            >
              {q === 0 ? t("wholeYear") : `Q${q}`}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div data-tour="expenses-new">
          <Button onClick={() => (open ? setOpen(false) : startAdd())}>+ {t("new")}</Button>
        </div>
      </div>

      {/* Formulier */}
      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h3 className="col-span-full font-semibold text-white">{editingId ? t("editTitle") : t("new")}</h3>
          <Input type="date" label={t("fieldDate")} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label={t("fieldVendor")} value={form.vendor} placeholder={t("vendorPlaceholder")} onChange={(e) => setForm({ ...form, vendor: e.target.value })} required />
          <Select
            label={t("fieldCategory")}
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v as Category })}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
          />
          <Input type="number" step="0.01" min="0.01" label={t("fieldAmount")} value={form.amountGross} onChange={(e) => setForm({ ...form, amountGross: e.target.value })} required />
          <Select
            label={t("fieldVatRate")}
            value={form.vatRate}
            onChange={(v) => setForm({ ...form, vatRate: v })}
            options={[
              { value: "21", label: "21%" },
              { value: "9", label: "9%" },
              { value: "0", label: `0% (${t("vatExempt")})` },
            ]}
          />
          <Input label={t("fieldDescription")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

          {/* Bonnetje */}
          <div className="col-span-full flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
              <Icon name="download" className="h-4 w-4" />
              {form.receipt ? t("receiptReplace") : t("receiptAdd")}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            {form.receipt && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.receipt} alt={t("receipt")} className="h-12 w-12 rounded-lg border border-white/[0.06] object-cover" />
                <button type="button" onClick={() => setForm({ ...form, receipt: null })} className="text-xs font-medium text-rose-400 hover:underline">
                  {t("receiptRemove")}
                </button>
              </>
            )}
          </div>

          {/* Bonnetje scannen: vult leverancier, bedrag, datum en btw in (gebruiker controleert) */}
          {inboxItemId && <p className="col-span-full rounded-lg border border-brand-500/20 bg-brand-500/[0.06] px-3 py-2 text-xs text-brand-100">{t("inbox.processingNote")}</p>}
          {form.receipt && !editingId && (
            <div className="col-span-full">
              <ReceiptScanner
                image={form.receipt}
                onResult={(r) =>
                  setForm((f) => ({
                    ...f,
                    vendor: r.vendor ?? f.vendor,
                    amountGross: r.total !== null ? String(r.total) : f.amountGross,
                    date: r.date ?? f.date,
                    vatRate: r.vatRate !== null ? String(r.vatRate) : f.vatRate,
                  }))
                }
              />
            </div>
          )}

          {error && <p className="col-span-full text-sm text-rose-400">{error}</p>}
          <div className="col-span-full flex gap-2">
            <Button type="submit" disabled={saving || !form.vendor || !form.amountGross}>{saving ? "..." : editingId ? t("save") : t("add")}</Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditingId(null); setInboxItemId(null); }}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {/* Lijst */}
      <div data-tour="expenses-list">
      <Card className="overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="font-semibold text-white">{t("listTitle")} ({filtered.length})</h2>
        </div>
        {filtered.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("fieldDate")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("fieldVendor")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("fieldCategory")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("colGross")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("colVat")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("receipt")}</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-3 text-slate-400">{e.date}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-white">{e.vendor}</p>
                      {e.description && <p className="text-xs text-slate-400">{e.description}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-400">{t(`categories.${e.category}`)}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-white">{formatMoney(e.amountGross, locale)}</td>
                    <td className="px-5 py-3 text-right text-slate-400">{formatMoney(e.vatAmount, locale)}</td>
                    <td className="px-5 py-3">
                      {e.receipt ? (
                        <button onClick={() => setViewReceipt(e.receipt)} title={t("receiptView")}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={e.receipt} alt={t("receipt")} className="h-9 w-9 rounded-md border border-white/[0.06] object-cover" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => startEdit(e)} className="text-xs font-medium text-brand-400 hover:underline">{t("edit")}</button>
                        <button onClick={() => remove(e.id)} className="text-xs font-medium text-rose-400 hover:underline">{t("remove")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>

      {/* Bonnetje-lightbox */}
      {viewReceipt && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setViewReceipt(null)}
          role="dialog"
          aria-modal
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewReceipt} alt={t("receipt")} className="max-h-full max-w-full rounded-xl shadow-2xl" />
          <button className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow" onClick={() => setViewReceipt(null)} aria-label={t("close")}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
