"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Icon } from "@/components/ui/Icon";

// Haalt een leesbare foutmelding uit een API-response (voor formulieren).
async function apiError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  const issue = data?.issues?.fieldErrors ? Object.values(data.issues.fieldErrors).flat()[0] : null;
  return String(issue ?? data?.error ?? "Opslaan mislukt. Controleer je invoer en probeer het opnieuw.");
}


interface Option { id: string; name: string }

interface Entry {
  id: string;
  date: string;
  fromAddress: string;
  toAddress: string;
  distanceKm: string | number;
  ratePerKm: string | number;
  type: "BUSINESS" | "PRIVATE";
  description: string | null;
  projectId: string | null;
  project: { name: string } | null;
}

type Period = "MONTH" | "QUARTER" | "YEAR" | "ALL";
type TypeFilter = "ALL" | "BUSINESS" | "PRIVATE";

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  fromAddress: "",
  toAddress: "",
  distanceKm: 0,
  type: "BUSINESS" as "BUSINESS" | "PRIVATE",
  projectId: "",
  description: "",
};

export function MileageManager({ projects }: { projects: Option[] }) {
  const t = useTranslations("mileage");
  const locale = useLocale();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [type, setType] = useState<TypeFilter>("ALL");
  const [period, setPeriod] = useState<Period>("MONTH");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [roundTrip, setRoundTrip] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Opgeslagen "snelle routes" — lokaal, geen server nodig. Voor ritten die je
  // vaak rijdt (thuis → vaste klant), zodat je ze met één klik invult.
  type Route = { from: string; to: string; km: number };
  const [routes, setRoutes] = useState<Route[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vtech-routes");
      if (raw) setRoutes(JSON.parse(raw) as Route[]);
    } catch { /* negeren */ }
  }, []);
  function persistRoutes(next: Route[]) {
    setRoutes(next);
    localStorage.setItem("vtech-routes", JSON.stringify(next));
  }
  function saveCurrentRoute() {
    const r: Route = { from: form.fromAddress.trim(), to: form.toAddress.trim(), km: Number(form.distanceKm) };
    if (!r.from || !r.to || r.km <= 0) return;
    // Dedupe op from+to+km.
    if (routes.some((x) => x.from === r.from && x.to === r.to && x.km === r.km)) return;
    persistRoutes([r, ...routes].slice(0, 12));
  }
  function applyRoute(r: Route) {
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10), fromAddress: r.from, toAddress: r.to, distanceKm: r.km });
    setEditId(null);
    setRoundTrip(false);
    setOpen(true);
  }
  function removeRoute(idx: number) {
    persistRoutes(routes.filter((_, i) => i !== idx));
  }

  // Herhaal een rit: dezelfde gegevens, datum vandaag.
  async function repeat(e: Entry) {
    await fetch("/api/mileage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        fromAddress: e.fromAddress,
        toAddress: e.toAddress,
        distanceKm: Number(e.distanceKm),
        type: e.type,
        projectId: e.projectId || null,
        description: e.description || undefined,
      }),
    });
    load();
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/mileage");
    if (res.ok) setEntries(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  // Filters
  const now = new Date();
  const inPeriod = (iso: string) => {
    if (period === "ALL") return true;
    const d = new Date(iso);
    if (d.getFullYear() !== now.getFullYear()) return false;
    if (period === "YEAR") return true;
    if (period === "MONTH") return d.getMonth() === now.getMonth();
    return Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  };
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (type === "ALL" ? true : e.type === type) &&
        inPeriod(e.date) &&
        (q === "" ||
          e.fromAddress.toLowerCase().includes(q) ||
          e.toAddress.toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)),
    );
  }, [entries, type, period, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // KPI's
  const businessKm = filtered.filter((e) => e.type === "BUSINESS").reduce((s, e) => s + Number(e.distanceKm), 0);
  const privateKm = filtered.filter((e) => e.type === "PRIVATE").reduce((s, e) => s + Number(e.distanceKm), 0);
  const deduction = filtered.filter((e) => e.type === "BUSINESS").reduce((s, e) => s + Number(e.distanceKm) * Number(e.ratePerKm), 0);

  // km per maand (laatste 6 mnd, zakelijk) — over alle entries
  const fmtMonth = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", { month: "short" });
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: fmtMonth.format(d) };
  });
  const monthly = months.map((mo) => ({
    label: mo.label,
    km: entries
      .filter((e) => e.type === "BUSINESS")
      .filter((e) => { const d = new Date(e.date); return d.getFullYear() === mo.y && d.getMonth() === mo.m; })
      .reduce((s, e) => s + Number(e.distanceKm), 0),
  }));
  const maxKm = Math.max(...monthly.map((m) => m.km), 1);

  // Groepeer per maand voor de tabel
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      const key = e.date.slice(0, 7);
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  function resetForm() {
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setRoundTrip(false);
    setEditId(null);
  }

  function startEdit(e: Entry) {
    setForm({
      date: e.date.slice(0, 10),
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      distanceKm: Number(e.distanceKm),
      type: e.type,
      projectId: e.projectId ?? "",
      description: e.description ?? "",
    });
    setEditId(e.id);
    setRoundTrip(false);
    setOpen(true);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    const payload = {
      date: form.date,
      fromAddress: form.fromAddress,
      toAddress: form.toAddress,
      distanceKm: Number(form.distanceKm),
      type: form.type,
      projectId: form.projectId || null,
      description: form.description || undefined,
    };
    if (editId) {
      const res = await fetch(`/api/mileage/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        setSaving(false);
        alert(await apiError(res));
        return;
      }
    } else {
      const res = await fetch("/api/mileage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        setSaving(false);
        alert(await apiError(res));
        return;
      }
      if (roundTrip) {
        // Retour: zelfde rit omgedraaid
        await fetch("/api/mileage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, fromAddress: form.toAddress, toAddress: form.fromAddress }),
        });
      }
    }
    setSaving(false);
    resetForm();
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    await fetch(`/api/mileage/${id}`, { method: "DELETE" });
    load();
  }

  function exportCsv() {
    const header = ["Datum", t("from"), t("to"), "km", t("type"), t("ratePerKm"), "Bedrag", t("project"), t("description")];
    const rows = filtered.map((e) => [
      e.date.slice(0, 10), e.fromAddress, e.toAddress, Number(e.distanceKm),
      e.type === "BUSINESS" ? t("business") : t("private"),
      Number(e.ratePerKm).toFixed(2), (Number(e.distanceKm) * Number(e.ratePerKm)).toFixed(2),
      e.project?.name ?? "", e.description ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ritten.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const periods: Period[] = ["MONTH", "QUARTER", "YEAR", "ALL"];
  const types: TypeFilter[] = ["ALL", "BUSINESS", "PRIVATE"];
  const periodLabel: Record<Period, string> = { MONTH: t("periodMonth"), QUARTER: t("periodQuarter"), YEAR: t("periodYear"), ALL: t("periodAll") };
  const typeLabel: Record<TypeFilter, string> = { ALL: t("filterAll"), BUSINESS: t("business"), PRIVATE: t("private") };

  return (
    <div className="flex flex-col gap-6">
      {/* Snelle routes (favorieten) */}
      {routes.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("quickRoutes")}</p>
          <div className="flex flex-wrap gap-2">
            {routes.map((r, i) => (
              <span key={`${r.from}-${r.to}-${r.km}-${i}`} className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-3 pr-1.5 text-xs">
                <button onClick={() => applyRoute(r)} className="flex items-center gap-1.5 text-slate-200 hover:text-white">
                  <Icon name="car" className="h-3.5 w-3.5 text-brand-300" />
                  <span className="max-w-[220px] truncate">{r.from} → {r.to}</span>
                  <span className="tabular text-slate-500">{r.km} km</span>
                </button>
                <button onClick={() => removeRoute(i)} aria-label={t("remove")} className="flex h-4 w-4 items-center justify-center rounded-full text-slate-500 hover:bg-white/10 hover:text-rose-300">×</button>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* KPI's */}
      <div data-tour="mileage-kpis" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("totalBusiness")} value={`${businessKm.toFixed(0)} km`} icon="car" tone="green" />
        <StatCard label={t("kpiPrivateKm")} value={`${privateKm.toFixed(0)} km`} icon="building" tone="teal" />
        <StatCard label={t("deduction")} value={`€ ${deduction.toFixed(2)}`} icon="euro" tone="amber" sub={`€ 0,23/km`} />
        <StatCard label={t("kpiTrips")} value={String(filtered.length)} icon="car" tone="brand" />
      </div>

      {/* Grafiek + filters/acties */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-white">{t("chartTitle")}</h2>
          <div data-tour="mileage-chart" className="flex h-40 items-end gap-2 sm:gap-4">
            {monthly.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className="group relative w-full max-w-[40px] rounded-t-lg bg-gradient-to-t from-emerald-600 via-emerald-500 to-teal-400 shadow-[0_0_14px_-2px_rgba(16,185,129,0.6)]"
                    style={{ height: `${Math.max((m.km / maxKm) * 100, 2)}%` }}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-500 opacity-0 group-hover:opacity-100">{m.km.toFixed(0)}</span>
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-500">{m.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div data-tour="mileage-filters">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("type")}</p>
            <div className="flex flex-wrap gap-1">
              {types.map((ty) => (
                <button key={ty} onClick={() => setType(ty)} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", type === ty ? "bg-brand-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10")}>
                  {typeLabel[ty]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("periodLabel")}</p>
            <div className="flex flex-wrap gap-1">
              {periods.map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", period === p ? "bg-brand-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10")}>
                  {periodLabel[p]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("search")}</p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div data-tour="mileage-new" className="mt-auto flex flex-col gap-2">
            <Button onClick={() => { resetForm(); setOpen(true); }}>+ {t("new")}</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>⬇ {t("export")}</Button>
          </div>
        </Card>
      </div>

      {/* Toevoeg/bewerk-formulier */}
      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="col-span-full font-semibold">{editId ? t("editTitle") : t("new")}</h2>
          <Input type="date" label={t("date")} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label={t("from")} value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} required />
          <Input label={t("to")} value={form.toAddress} onChange={(e) => setForm({ ...form, toAddress: e.target.value })} required />
          <Input type="number" step="0.1" label={t("distance")} value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: Number(e.target.value) })} />
          <Select
            label={t("type")}
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as "BUSINESS" | "PRIVATE" })}
            options={[{ value: "BUSINESS", label: t("business") }, { value: "PRIVATE", label: t("private") }]}
          />
          <Select
            label={t("project")}
            value={form.projectId}
            onChange={(v) => setForm({ ...form, projectId: v })}
            options={[{ value: "", label: "—" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Input label={t("description")} className="col-span-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {!editId && (
            <label className="col-span-full flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
              {t("roundTrip")}
            </label>
          )}
          <div className="col-span-full flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving || !form.fromAddress || !form.toAddress}>{saving ? "..." : t("save")}</Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>{t("cancel")}</Button>
            {!editId && form.fromAddress && form.toAddress && Number(form.distanceKm) > 0 && (
              <button type="button" onClick={saveCurrentRoute} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white">
                <Icon name="star" className="h-3.5 w-3.5 text-brand-300" />{t("saveRoute")}
              </button>
            )}
          </div>
        </form>
      )}

      {/* Tabel, gegroepeerd per maand */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">{t("noResults")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([key, items]) => {
            const km = items.reduce((s, e) => s + Number(e.distanceKm), 0);
            const monthLabel = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", { month: "long", year: "numeric" }).format(new Date(key + "-01"));
            return (
              <Card key={key} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-5 py-2.5">
                  <span className="text-sm font-semibold capitalize text-slate-300">{monthLabel}</span>
                  <span className="text-xs text-slate-400">{km.toFixed(0)} km</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-slate-400">
                      <tr>
                        <th className="px-5 py-2 font-medium">{t("date")}</th>
                        <th className="px-5 py-2 font-medium">{t("from")} → {t("to")}</th>
                        <th className="px-5 py-2 font-medium">{t("distance")}</th>
                        <th className="px-5 py-2 font-medium">{t("type")}</th>
                        <th className="px-5 py-2 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((e) => (
                        <tr key={e.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                          <td className="px-5 py-2.5 text-slate-400">{e.date.slice(0, 10)}</td>
                          <td className="px-5 py-2.5 text-slate-200">{e.fromAddress} → {e.toAddress}{e.project ? <span className="ml-2 text-xs text-slate-500">· {e.project.name}</span> : null}</td>
                          <td className="px-5 py-2.5 font-medium text-white">{Number(e.distanceKm)} km</td>
                          <td className="px-5 py-2.5">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", e.type === "BUSINESS" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-400")}>
                              {e.type === "BUSINESS" ? t("business") : t("private")}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-right whitespace-nowrap">
                            <button onClick={() => repeat(e)} className="text-xs font-medium text-emerald-400 hover:underline">{t("repeat")}</button>
                            <button onClick={() => startEdit(e)} className="ml-3 text-xs font-medium text-brand-400 hover:underline">{t("edit")}</button>
                            <button onClick={() => remove(e.id)} className="ml-3 text-xs font-medium text-rose-400 hover:underline">{t("remove")}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
