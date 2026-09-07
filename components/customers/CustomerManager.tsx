"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  vatNumber: string | null;
  invoiceCount: number;
  revenue: number;
}

const emptyForm = { name: "", email: "", address: "", postalCode: "", city: "", country: "NL", vatNumber: "" };

export function CustomerManager() {
  const t = useTranslations("customers");
  const locale = useLocale();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/customers");
      if (!res.ok) throw new Error(String(res.status));
      setCustomers(await res.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => `${c.name} ${c.email ?? ""} ${c.city ?? ""}`.toLowerCase().includes(q));
  }, [customers, search]);

  const totalRevenue = customers.reduce((s, c) => s + c.revenue, 0);
  const withInvoices = customers.filter((c) => c.invoiceCount > 0).length;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function resetForm() { setForm({ ...emptyForm }); setEditId(null); }
  function startEdit(c: Customer) {
    setForm({ name: c.name, email: c.email ?? "", address: c.address ?? "", postalCode: c.postalCode ?? "", city: c.city ?? "", country: c.country ?? "NL", vatNumber: c.vatNumber ?? "" });
    setEditId(c.id);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const url = editId ? `/api/customers/${editId}` : "/api/customers";
    const method = editId ? "PATCH" : "POST";
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        // Fout tonen en het formulier open laten, zodat niets stilletjes verdwijnt
        const data = await res.json().catch(() => null);
        const issue = data?.issues?.fieldErrors ? Object.values(data.issues.fieldErrors).flat()[0] : null;
        setFormError(String(issue ?? data?.error ?? t("saveError")));
        return;
      }
      resetForm();
      setOpen(false);
      load();
    } catch {
      setFormError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Customer) {
    if (!confirm(t("removeConfirm"))) return;
    const res = await fetch(`/api/customers/${c.id}`, { method: "DELETE" });
    if (res.status === 409) { alert(t("hasInvoices")); return; }
    load();
  }

  function exportCsv() {
    const header = [t("name"), t("email"), t("city"), t("vatNumber"), t("invoiceCount"), t("revenue")];
    const rows = filtered.map((c) => [c.name, c.email ?? "", c.city ?? "", c.vatNumber ?? "", c.invoiceCount, c.revenue.toFixed(2)]);
    const csv = [header, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "klanten.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div data-tour="customers-kpis" className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("kpiTotal")} value={String(customers.length)} icon="users" tone="brand" />
        <StatCard label={t("kpiActive")} value={String(withInvoices)} icon="check-circle" tone="teal" />
        <StatCard label={t("kpiRevenue")} value={formatMoney(totalRevenue, locale)} icon="euro" tone="green" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div data-tour="customers-search"><Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" /></div>
        <div className="flex-1" />
        <div data-tour="customers-export"><Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>⬇ {t("export")}</Button></div>
        <div data-tour="customers-new"><Button onClick={() => { resetForm(); setOpen(true); }}>+ {t("new")}</Button></div>
      </div>

      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 sm:grid-cols-2">
          <h2 className="col-span-full font-semibold">{editId ? t("editTitle") : t("new")}</h2>
          <Input label={t("name")} className="col-span-full" value={form.name} onChange={set("name")} required />
          <Input label={t("email")} type="email" value={form.email} onChange={set("email")} />
          <Input label={t("vatNumber")} value={form.vatNumber} onChange={set("vatNumber")} />
          <Input label={t("address")} className="col-span-full" value={form.address} onChange={set("address")} />
          <Input label={t("postalCode")} value={form.postalCode} onChange={set("postalCode")} />
          <Input label={t("city")} value={form.city} onChange={set("city")} />
          {formError && <p className="col-span-full text-sm font-medium text-rose-400">{formError}</p>}
          <div className="col-span-full flex gap-2">
            <Button type="submit" disabled={saving || !form.name}>{saving ? "..." : t("save")}</Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {loadError && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{t("loadError")}</span>
          <button onClick={load} className="font-semibold hover:underline">{t("retry")}</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">{t("empty")}</p>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/[0.03] text-left text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("name")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("email")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("city")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("invoiceCount")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("revenue")}</th>
                  <th className="px-5 py-2.5 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5 font-medium text-white">{c.name}</td>
                    <td className="px-5 py-2.5 text-slate-400">{c.email ?? "—"}</td>
                    <td className="px-5 py-2.5 text-slate-400">{c.city ?? "—"}</td>
                    <td className="px-5 py-2.5 text-slate-400">{c.invoiceCount}</td>
                    <td className="px-5 py-2.5 font-medium text-white">{formatMoney(c.revenue, locale)}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(c)} className="text-xs font-medium text-brand-400 hover:underline">{t("edit")}</button>
                      <button onClick={() => remove(c)} className="ml-3 text-xs font-medium text-rose-400 hover:underline">{t("remove")}</button>
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
