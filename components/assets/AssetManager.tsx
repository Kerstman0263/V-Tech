"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { ASSET_CATEGORIES } from "@/lib/validations/asset";
import { bookValueAt, depreciationInYear, monthlyDepreciation, progress } from "@/lib/depreciation";

type Category = (typeof ASSET_CATEGORIES)[number];

interface Asset {
  id: string;
  name: string;
  category: Category;
  purchaseDate: string;
  purchasePrice: string | number;
  residualValue: string | number;
  usefulLifeMonths: number;
  disposedAt: string | null;
  notes: string | null;
}

interface Form {
  name: string;
  category: Category;
  purchaseDate: string;
  purchasePrice: string;
  residualValue: string;
  years: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY: Form = { name: "", category: "EQUIPMENT", purchaseDate: today(), purchasePrice: "", residualValue: "0", years: "5", notes: "" };

const toDep = (a: Asset) => ({
  purchaseDate: new Date(a.purchaseDate),
  purchasePrice: Number(a.purchasePrice),
  residualValue: Number(a.residualValue),
  usefulLifeMonths: a.usefulLifeMonths,
  disposedAt: a.disposedAt ? new Date(a.disposedAt) : null,
});

/** Bezittingen met lineaire maandafschrijving en boekwaarde. */
export function AssetManager({ locale = "nl" }: { locale?: string }) {
  const t = useTranslations("assets");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, locale, "EUR");
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();

  const load = useCallback(async () => {
    const res = await fetch("/api/assets");
    if (res.ok) setAssets(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = assets.filter((a) => !a.disposedAt);
    return {
      count: active.length,
      purchase: active.reduce((s, a) => s + Number(a.purchasePrice), 0),
      book: active.reduce((s, a) => s + bookValueAt(toDep(a), now), 0),
      thisYear: assets.reduce((s, a) => s + depreciationInYear(toDep(a), year), 0),
    };
  }, [assets, now, year]);

  function startNew() {
    setForm(EMPTY);
    setEditing("new");
    setError(null);
  }
  function startEdit(a: Asset) {
    setForm({
      name: a.name,
      category: a.category,
      purchaseDate: a.purchaseDate.slice(0, 10),
      purchasePrice: String(a.purchasePrice),
      residualValue: String(a.residualValue),
      years: String(Math.round(a.usefulLifeMonths / 12)),
      notes: a.notes ?? "",
    });
    setEditing(a.id);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      category: form.category,
      purchaseDate: form.purchaseDate,
      purchasePrice: Number(form.purchasePrice),
      residualValue: Number(form.residualValue || 0),
      usefulLifeMonths: Math.max(1, Math.round(Number(form.years) * 12)),
      notes: form.notes || undefined,
    };
    const res = await fetch(editing === "new" ? "/api/assets" : `/api/assets/${editing}`, {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error ?? t("saveError"));
      return;
    }
    setEditing(null);
    load();
  }

  async function dispose(a: Asset) {
    if (!confirm(t("disposeConfirm", { name: a.name }))) return;
    await fetch(`/api/assets/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disposedAt: today() }) });
    load();
  }
  async function remove(a: Asset) {
    if (!confirm(t("removeConfirm", { name: a.name }))) return;
    await fetch(`/api/assets/${a.id}`, { method: "DELETE" });
    load();
  }

  const formEl = (
    <form onSubmit={save} className="grid gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-4 sm:grid-cols-2 lg:grid-cols-3">
      <Input label={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("namePlaceholder")} required />
      <Select label={t("category")} value={form.category} onChange={(v) => setForm({ ...form, category: v as Category })} options={ASSET_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))} />
      <Input type="date" label={t("purchaseDate")} value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} required />
      <Input type="number" step="0.01" min="0.01" label={t("purchasePrice")} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} required />
      <Input type="number" step="0.01" min="0" label={t("residualValue")} value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: e.target.value })} />
      <Select
        label={t("lifetime")}
        value={form.years}
        onChange={(v) => setForm({ ...form, years: v })}
        options={["3", "5", "10", "20"].map((y) => ({ value: y, label: t("years", { count: Number(y) }) }))}
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <Input label={t("notes")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      {Number(form.years) < 5 && <p className="text-xs text-amber-300 sm:col-span-2 lg:col-span-3">{t("fiscalHint")}</p>}
      {error && <p role="alert" className="text-sm text-rose-400 sm:col-span-2 lg:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={saving || !form.name.trim() || !form.purchasePrice}>{saving ? "…" : t("save")}</Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t("cancel")}</Button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("kpiCount")} value={String(stats.count)} icon="briefcase" tone="brand" />
        <StatCard label={t("kpiPurchase")} value={money(stats.purchase)} icon="euro" tone="teal" />
        <StatCard label={t("kpiBook")} value={money(stats.book)} icon="chart" tone="green" sub={t("kpiBookSub")} />
        <StatCard label={t("kpiYear", { year })} value={money(stats.thisYear)} icon="trend" tone="amber" sub={t("kpiYearSub")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-400">{t("intro")}</p>
        {editing !== "new" && (
          <Button onClick={startNew}>
            <Icon name="plus" className="mr-1 h-4 w-4" />
            {t("new")}
          </Button>
        )}
      </div>

      {editing === "new" && formEl}

      {loading ? (
        <div className="skeleton h-40 rounded-2xl" aria-hidden />
      ) : assets.length === 0 ? (
        editing !== "new" && <EmptyState icon="briefcase" title={t("empty")} description={t("emptyHint")} action={<Button onClick={startNew}>{t("new")}</Button>} />
      ) : (
        <div className="grid gap-3">
          {assets.map((a) => {
            const dep = toDep(a);
            const p = progress(dep, now);
            const book = bookValueAt(dep, now);
            const disposed = !!a.disposedAt;
            return (
              <Card key={a.id} className={cn("p-5", disposed && "opacity-60")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">
                      {a.name}
                      <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">{t(`categories.${a.category}`)}</span>
                      {disposed && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">{t("disposed")} {fmtDate(a.disposedAt!)}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t("bought")} {fmtDate(a.purchaseDate)} · {money(Number(a.purchasePrice))} · {t("years", { count: Math.round(a.usefulLifeMonths / 12) })} · {t("perMonth")} {money(monthlyDepreciation(dep))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("bookValue")}</p>
                    <p className="tabular text-xl font-bold text-white">{money(book)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400" style={{ width: `${p.pct}%` }} />
                  </div>
                  <span className="tabular text-xs text-slate-400">{t("progress", { done: p.done, total: p.total })}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <button onClick={() => startEdit(a)} className="font-medium text-brand-300 hover:underline">{t("edit")}</button>
                  {!disposed && <button onClick={() => dispose(a)} className="font-medium text-slate-400 hover:text-white">{t("dispose")}</button>}
                  <button onClick={() => remove(a)} className="font-medium text-rose-400 hover:underline">{t("remove")}</button>
                </div>
                {editing === a.id && <div className="mt-4">{formEl}</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
