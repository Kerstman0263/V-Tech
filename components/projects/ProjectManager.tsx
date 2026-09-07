"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";

// Haalt een leesbare foutmelding uit een API-response (voor formulieren).
async function apiError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  const issue = data?.issues?.fieldErrors ? Object.values(data.issues.fieldErrors).flat()[0] : null;
  return String(issue ?? data?.error ?? "Opslaan mislukt. Controleer je invoer en probeer het opnieuw.");
}


interface Option { id: string; name: string }

interface Project {
  id: string;
  name: string;
  description: string | null;
  hourlyRate: string | number | null;
  archived: boolean;
  customerId: string | null;
  customer: { name: string } | null;
  _count: { timeEntries: number; mileage: number };
}

const emptyForm = { name: "", customerId: "", description: "", hourlyRate: 0 };

export function ProjectManager({ customers }: { customers: Option[] }) {
  const t = useTranslations("projects");
  const locale = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) setProjects(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter((p) => (showArchived ? true : !p.archived))
      .filter((p) => (!q ? true : `${p.name} ${p.customer?.name ?? ""}`.toLowerCase().includes(q)));
  }, [projects, search, showArchived]);

  const active = projects.filter((p) => !p.archived).length;

  function resetForm() { setForm({ ...emptyForm }); setEditId(null); }
  function startEdit(p: Project) {
    setForm({ name: p.name, customerId: p.customerId ?? "", description: p.description ?? "", hourlyRate: Number(p.hourlyRate ?? 0) });
    setEditId(p.id);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name: form.name, customerId: form.customerId || null, description: form.description || undefined, hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined };
    const url = editId ? `/api/projects/${editId}` : "/api/projects";
    const res = await fetch(url, { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) {
      alert(await apiError(res));
      return;
    }
    resetForm();
    setOpen(false);
    load();
  }

  async function toggleArchive(p: Project) {
    await fetch(`/api/projects/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !p.archived }) });
    load();
  }
  async function remove(p: Project) {
    if (!confirm(t("removeConfirm"))) return;
    await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    load();
  }

  function exportCsv() {
    const header = [t("name"), t("customer"), t("hourlyRate"), t("kpiHours"), t("kpiTrips")];
    const rows = filtered.map((p) => [p.name, p.customer?.name ?? "", Number(p.hourlyRate ?? 0).toFixed(2), p._count.timeEntries, p._count.mileage]);
    const csv = [header, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "projecten.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div data-tour="projects-kpis" className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("kpiTotal")} value={String(projects.length)} icon="folder" tone="brand" />
        <StatCard label={t("kpiActiveProjects")} value={String(active)} icon="check-circle" tone="green" />
        <StatCard label={t("kpiCustomers")} value={String(new Set(projects.filter((p) => p.customerId).map((p) => p.customerId)).size)} icon="users" tone="teal" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <label data-tour="projects-archived" className="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t("showArchived")}
        </label>
        <div className="flex-1" />
        <div data-tour="projects-export"><Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>⬇ {t("export")}</Button></div>
        <div data-tour="projects-new"><Button onClick={() => { resetForm(); setOpen(true); }}>+ {t("new")}</Button></div>
      </div>

      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 sm:grid-cols-2">
          <h2 className="col-span-full font-semibold">{editId ? t("editTitle") : t("new")}</h2>
          <Input label={t("name")} className="col-span-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select
            label={t("customer")}
            value={form.customerId}
            onChange={(v) => setForm({ ...form, customerId: v })}
            options={[{ value: "", label: t("noCustomer") }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Input type="number" step="0.01" label={t("hourlyRate")} value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })} />
          <Input label={t("description")} className="col-span-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="col-span-full flex gap-2">
            <Button type="submit" disabled={saving || !form.name}>{saving ? "..." : t("save")}</Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">{t("empty")}</p>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-white/[0.03] text-left text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("name")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("customer")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("hourlyRate")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("kpiHours")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("kpiTrips")}</th>
                  <th className="px-5 py-2.5 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={cn("border-t border-white/[0.04] hover:bg-white/[0.03]", p.archived && "opacity-50")}>
                    <td className="px-5 py-2.5 font-medium text-white">
                      {p.name}{p.archived && <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">{t("archived")}</span>}
                    </td>
                    <td className="px-5 py-2.5 text-slate-400">{p.customer?.name ?? "—"}</td>
                    <td className="px-5 py-2.5 text-slate-400">{p.hourlyRate ? formatMoney(Number(p.hourlyRate), locale) : "—"}</td>
                    <td className="px-5 py-2.5 text-slate-400">{p._count.timeEntries}</td>
                    <td className="px-5 py-2.5 text-slate-400">{p._count.mileage}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(p)} className="text-xs font-medium text-brand-400 hover:underline">{t("edit")}</button>
                      <button onClick={() => toggleArchive(p)} className="ml-3 text-xs font-medium text-slate-400 hover:underline">{p.archived ? t("unarchive") : t("archive")}</button>
                      <button onClick={() => remove(p)} className="ml-3 text-xs font-medium text-rose-400 hover:underline">{t("remove")}</button>
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
