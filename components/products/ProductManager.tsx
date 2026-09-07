"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";

interface Product {
  id: string;
  name: string;
  description: string | null;
  unitPrice: string | number;
  vatRate: string | number;
  unit: string | null;
  active: boolean;
}

interface Draft {
  name: string;
  description: string;
  unitPrice: number;
  vatRate: number;
  unit: string;
}

const EMPTY: Draft = { name: "", description: "", unitPrice: 0, vatRate: 21, unit: "" };
const INPUT =
  "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/** Producten-/dienstencatalogus: vaste regels voor facturen en offertes. */
export function ProductManager({ locale = "nl", kor = false }: { locale?: string; kor?: boolean }) {
  const t = useTranslations("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, vatRate: kor ? 0 : 21 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, locale, "EUR");

  const load = useCallback(async () => {
    const res = await fetch("/api/products?all=1");
    if (res.ok) setProducts(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (showArchived || p.active) && (!q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)));
  }, [products, query, showArchived]);

  const active = products.filter((p) => p.active);
  const avg = active.length ? active.reduce((s, p) => s + Number(p.unitPrice), 0) / active.length : 0;

  function startNew() {
    setDraft({ ...EMPTY, vatRate: kor ? 0 : 21 });
    setEditing("new");
    setError(null);
  }
  function startEdit(p: Product) {
    setDraft({ name: p.name, description: p.description ?? "", unitPrice: Number(p.unitPrice), vatRate: Number(p.vatRate), unit: p.unit ?? "" });
    setEditing(p.id);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { ...draft, description: draft.description || undefined, unit: draft.unit || undefined };
    const res = await fetch(editing === "new" ? "/api/products" : `/api/products/${editing}`, {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("saveError"));
      return;
    }
    setEditing(null);
    load();
  }

  async function setActive(p: Product, value: boolean) {
    await fetch(`/api/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: value }) });
    load();
  }
  async function remove(p: Product) {
    if (!confirm(t("removeConfirm", { name: p.name }))) return;
    await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    load();
  }

  const form = (
    <form onSubmit={save} className="grid gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-4 sm:grid-cols-12">
      <div className="sm:col-span-5">
        <Input label={t("name")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("namePlaceholder")} required />
      </div>
      <div className="sm:col-span-3">
        <label className="text-sm font-medium text-slate-300">{t("unitPrice")}</label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">€</span>
          <input type="number" step="0.01" min="0" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) })} className={cn(INPUT, "tabular w-full pl-7 text-right")} required />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="text-sm font-medium text-slate-300">{t("vatRate")}</label>
        <div className="mt-1 flex gap-1">
          {[21, 9, 0].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDraft({ ...draft, vatRate: r })}
              className={cn("flex-1 rounded-lg border px-2 py-2 text-xs font-semibold", draft.vatRate === r ? "border-brand-500/40 bg-brand-500/15 text-brand-200" : "border-white/10 bg-white/[0.03] text-slate-400")}
            >
              {r}%
            </button>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <Input label={t("unit")} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder={t("unitPlaceholder")} />
      </div>
      <div className="sm:col-span-12">
        <Input label={t("description")} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t("descriptionPlaceholder")} />
      </div>
      {error && <p role="alert" className="text-sm text-rose-400 sm:col-span-12">{error}</p>}
      <div className="flex gap-2 sm:col-span-12">
        <Button type="submit" disabled={saving || !draft.name.trim()}>{saving ? "…" : t("save")}</Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t("cancel")}</Button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("kpiActive")} value={String(active.length)} icon="folder" tone="brand" />
        <StatCard label={t("kpiAvg")} value={money(avg)} icon="euro" tone="teal" />
        <StatCard label={t("kpiArchived")} value={String(products.length - active.length)} icon="inbox" tone="amber" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand-500" />
          {t("showArchived")}
        </label>
        <div className="ml-auto">
          <Button onClick={startNew} disabled={editing === "new"}>
            <Icon name="plus" className="mr-1 h-4 w-4" />
            {t("new")}
          </Button>
        </div>
      </div>

      {editing === "new" && form}

      {loading ? (
        <div className="skeleton h-40 rounded-2xl" aria-hidden />
      ) : visible.length === 0 ? (
        <EmptyState icon="folder" title={products.length === 0 ? t("empty") : t("noResults")} description={products.length === 0 ? t("emptyHint") : undefined} action={products.length === 0 ? <Button onClick={startNew}>{t("new")}</Button> : undefined} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/[0.03] text-left text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("name")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("unitPrice")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("vatRate")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("unit")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr className={cn("border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]", !p.active && "opacity-60")}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-white">
                          {p.name}
                          {!p.active && <span className="ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{t("archived")}</span>}
                        </p>
                        {p.description && <p className="text-xs text-slate-500">{p.description}</p>}
                      </td>
                      <td className="tabular px-5 py-3 text-right font-medium text-white">{money(Number(p.unitPrice))}</td>
                      <td className="tabular px-5 py-3 text-right text-slate-400">{Number(p.vatRate)}%</td>
                      <td className="px-5 py-3 text-slate-400">{p.unit ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => startEdit(p)} className="text-xs font-medium text-brand-300 hover:underline">{t("edit")}</button>
                          <button onClick={() => setActive(p, !p.active)} className="text-xs font-medium text-slate-400 hover:text-white">{p.active ? t("archive") : t("restore")}</button>
                          <button onClick={() => remove(p)} className="text-xs font-medium text-rose-400 hover:underline">{t("remove")}</button>
                        </div>
                      </td>
                    </tr>
                    {editing === p.id && (
                      <tr className="border-t border-white/[0.04]">
                        <td colSpan={5} className="px-5 py-4">{form}</td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

import React from "react";
