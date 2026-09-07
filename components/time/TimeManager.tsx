"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn, formatMoney } from "@/lib/utils";
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
  hours: string | number;
  hourlyRate: string | number | null;
  description: string;
  status: "OPEN" | "BILLED";
  approval: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  rejectReason: string | null;
  createdById: string | null;
  createdByName: string | null;
  projectId: string | null;
  customerId: string | null;
  project: { name: string } | null;
  customer: { name: string } | null;
}

type Period = "MONTH" | "QUARTER" | "YEAR" | "ALL";
type StatusFilter = "ALL" | "PENDING" | "OPEN" | "BILLED";

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  projectId: "",
  customerId: "",
  hours: 1,
  hourlyRate: 0,
  description: "",
};

export function TimeManager({ projects, customers, canApprove = false, needsApproval = false }: { projects: Option[]; customers: Option[]; canApprove?: boolean; needsApproval?: boolean }) {
  const t = useTranslations("time");
  const locale = useLocale();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [period, setPeriod] = useState<Period>("MONTH");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState(false);

  // --- Urentimer (lokaal, overleeft een refresh via localStorage) ---
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerDesc, setTimerDesc] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Bij laden: een lopende timer herstellen.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vtech-timer");
      if (raw) {
        const saved = JSON.parse(raw) as { start: number; desc: string };
        if (saved?.start) { setTimerStart(saved.start); setTimerDesc(saved.desc ?? ""); }
      }
    } catch { /* geen/ongeldige opslag — negeren */ }
  }, []);

  // Elke seconde de weergave verversen zolang de timer loopt.
  useEffect(() => {
    if (timerStart == null) return;
    setNowMs(Date.now());
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [timerStart]);

  function startTimer() {
    const start = Date.now();
    setTimerStart(start);
    localStorage.setItem("vtech-timer", JSON.stringify({ start, desc: timerDesc }));
  }
  function clearTimer() {
    setTimerStart(null);
    localStorage.removeItem("vtech-timer");
  }
  function stopTimer() {
    if (timerStart == null) return;
    const elapsedH = Math.max(0.01, Math.round(((Date.now() - timerStart) / 3600000) * 100) / 100);
    // Vul het uren-formulier voor; de gebruiker kiest nog klant/project/tarief.
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10), hours: elapsedH, description: timerDesc });
    setEditId(null);
    setOpen(true);
    setTimerDesc("");
    clearTimer();
  }
  function onTimerDescChange(v: string) {
    setTimerDesc(v);
    if (timerStart != null) localStorage.setItem("vtech-timer", JSON.stringify({ start: timerStart, desc: v }));
  }

  const elapsed = timerStart != null ? Math.max(0, nowMs - timerStart) : 0;
  const hhmmss = new Date(elapsed).toISOString().slice(11, 19); // HH:MM:SS

  const load = useCallback(async () => {
    const res = await fetch("/api/time-entries");
    if (res.ok) setEntries(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const inPeriod = (iso: string) => {
    if (period === "ALL") return true;
    const d = new Date(iso);
    if (d.getFullYear() !== now.getFullYear()) return false;
    if (period === "YEAR") return true;
    if (period === "MONTH") return d.getMonth() === now.getMonth();
    return Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  };
  const filtered = useMemo(
    () => entries.filter((e) => (status === "ALL" ? true : status === "PENDING" ? e.approval === "PENDING" : e.status === status) && inPeriod(e.date)),
    [entries, status, period], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const openHours = filtered.filter((e) => e.status === "OPEN").reduce((s, e) => s + Number(e.hours), 0);
  const billedHours = filtered.filter((e) => e.status === "BILLED").reduce((s, e) => s + Number(e.hours), 0);
  const openValue = filtered.filter((e) => e.status === "OPEN").reduce((s, e) => s + Number(e.hours) * Number(e.hourlyRate ?? 0), 0);

  const fmtMonth = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", { month: "short" });
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: fmtMonth.format(d) };
  });
  const monthly = months.map((mo) => ({
    label: mo.label,
    hours: entries
      .filter((e) => { const d = new Date(e.date); return d.getFullYear() === mo.y && d.getMonth() === mo.m; })
      .reduce((s, e) => s + Number(e.hours), 0),
  }));
  const maxH = Math.max(...monthly.map((m) => m.hours), 1);

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
    setEditId(null);
  }
  function startEdit(e: Entry) {
    setForm({
      date: e.date.slice(0, 10),
      projectId: e.projectId ?? "",
      customerId: e.customerId ?? "",
      hours: Number(e.hours),
      hourlyRate: Number(e.hourlyRate ?? 0),
      description: e.description,
    });
    setEditId(e.id);
    setOpen(true);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    const payload = {
      date: form.date,
      projectId: form.projectId || null,
      customerId: form.customerId || null,
      hours: Number(form.hours),
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
      description: form.description,
    };
    const res = editId
      ? await fetch(`/api/time-entries/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/time-entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) {
      alert(await apiError(res));
      return;
    }
    resetForm();
    setOpen(false);
    load();
  }

  // Goedkeuren/afkeuren (eigenaar/leidinggevende) — één of meerdere registraties tegelijk.
  const pending = useMemo(() => entries.filter((e) => e.approval === "PENDING"), [entries]);
  async function decide(ids: string[], decision: "APPROVED" | "REJECTED") {
    let reason: string | undefined;
    if (decision === "REJECTED") {
      const input = prompt(t("rejectReasonPrompt"));
      if (input === null) return;
      reason = input.trim() || undefined;
      if (!reason) return;
    }
    setDeciding(true);
    const res = await fetch("/api/time-entries/approval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, decision, reason }) });
    setDeciding(false);
    if (!res.ok) { alert(await apiError(res)); return; }
    load();
  }

  async function markBilled(id: string) {
    await fetch(`/api/time-entries/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "BILLED" }) });
    load();
  }
  async function remove(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    await fetch(`/api/time-entries/${id}`, { method: "DELETE" });
    load();
  }

  function exportCsv() {
    const header = ["Datum", t("project"), t("customer"), t("hours"), t("hourlyRate"), "Bedrag", t("status"), t("description")];
    const rows = filtered.map((e) => [
      e.date.slice(0, 10), e.project?.name ?? "", e.customer?.name ?? "",
      Number(e.hours), Number(e.hourlyRate ?? 0).toFixed(2), (Number(e.hours) * Number(e.hourlyRate ?? 0)).toFixed(2),
      e.status === "OPEN" ? t("open") : t("billed"), e.description,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "uren.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const periods: Period[] = ["MONTH", "QUARTER", "YEAR", "ALL"];
  const statuses: StatusFilter[] = canApprove ? ["ALL", "PENDING", "OPEN", "BILLED"] : ["ALL", "OPEN", "BILLED"];
  const periodLabel: Record<Period, string> = { MONTH: t("periodMonth"), QUARTER: t("periodQuarter"), YEAR: t("periodYear"), ALL: t("periodAll") };
  const statusLabel: Record<StatusFilter, string> = { ALL: t("filterAll"), PENDING: t("approvalPending"), OPEN: t("open"), BILLED: t("billed") };
  const approvalBadge = (e: Entry) => {
    if (e.approval === "NOT_REQUIRED") return null;
    const cls = e.approval === "APPROVED" ? "bg-emerald-500/15 text-emerald-300" : e.approval === "REJECTED" ? "bg-rose-500/15 text-rose-300" : "bg-sky-500/15 text-sky-300";
    const label = e.approval === "APPROVED" ? t("approvalApproved") : e.approval === "REJECTED" ? t("approvalRejected") : t("approvalPending");
    return <span title={e.approval === "REJECTED" && e.rejectReason ? t("rejectedReason", { reason: e.rejectReason }) : undefined} className={cn("ml-1.5 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Urentimer */}
      <div data-tour="time-timer">
      <Card className="p-5">
        {timerStart == null ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("timerTitle")}</p>
              <input
                value={timerDesc}
                onChange={(e) => onTimerDescChange(e.target.value)}
                placeholder={t("timerDescPlaceholder")}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <Button onClick={startTimer} className="sm:w-auto">
              <Icon name="clock" className="mr-1 inline h-4 w-4 align-[-2px]" />{t("timerStart")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <div>
                <p className="tabular text-3xl font-extrabold tracking-tight text-white">{hhmmss}</p>
                <p className="truncate text-sm text-slate-400">{timerDesc || t("timerRunning")}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={stopTimer}>{t("timerStop")}</Button>
              <Button variant="ghost" onClick={clearTimer}>{t("timerCancel")}</Button>
            </div>
          </div>
        )}
      </Card>
      </div>

      {needsApproval && (
        <p className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-200">{t("memberHint")}</p>
      )}

      {canApprove && (
        <div data-tour="time-approvals">
        <Card className="overflow-hidden border-amber-500/20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-amber-500/[0.06] px-5 py-3">
            <div>
              <h2 className="font-semibold text-white">{t("pendingTitle")} {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-200">{pending.length}</span>}</h2>
              <p className="text-xs text-slate-400">{t("pendingSub")}</p>
            </div>
            {pending.length > 0 && (
              <Button onClick={() => decide(pending.map((e) => e.id), "APPROVED")} disabled={deciding}>{t("approveAll", { count: pending.length })}</Button>
            )}
          </div>
          {pending.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">{t("pendingNone")}</p>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {pending.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{e.description}{(e.project || e.customer) ? <span className="ml-2 text-xs text-slate-500">· {e.project?.name ?? e.customer?.name}</span> : null}</p>
                    <p className="text-xs text-slate-500">{e.date.slice(0, 10)} {e.createdByName ? "· " + t("byMember", { name: e.createdByName }) : ""}</p>
                  </div>
                  <span className="tabular text-sm font-semibold text-white">{Number(e.hours)} u</span>
                  <div className="flex gap-2">
                    <button onClick={() => decide([e.id], "APPROVED")} disabled={deciding} className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">{t("approve")}</button>
                    <button onClick={() => decide([e.id], "REJECTED")} disabled={deciding} className="rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/25 disabled:opacity-50">{t("reject")}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </div>
      )}

      <div data-tour="time-kpis" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("kpiOpenHours")} value={`${openHours.toFixed(1)} u`} icon="clock" tone="amber" />
        <StatCard label={t("kpiBilledHours")} value={`${billedHours.toFixed(1)} u`} icon="check-circle" tone="green" />
        <StatCard label={t("kpiOpenValue")} value={formatMoney(openValue, locale)} icon="euro" tone="teal" />
        <StatCard label={t("kpiEntries")} value={String(filtered.length)} icon="invoice" tone="brand" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-white">{t("chartTitle")}</h2>
          <div data-tour="time-chart" className="flex h-40 items-end gap-2 sm:gap-4">
            {monthly.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className="group relative w-full max-w-[40px] rounded-t-lg bg-gradient-to-t from-brand-600 via-brand-500 to-cyan-400 shadow-[0_0_14px_-2px_rgba(31,131,197,0.55)]"
                    style={{ height: `${Math.max((m.hours / maxH) * 100, 2)}%` }}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-500 opacity-0 group-hover:opacity-100">{m.hours.toFixed(0)}u</span>
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-500">{m.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("status")}</p>
            <div className="flex flex-wrap gap-1">
              {statuses.map((s) => (
                <button key={s} onClick={() => setStatus(s)} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", status === s ? "bg-brand-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10")}>{statusLabel[s]}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("periodLabel")}</p>
            <div className="flex flex-wrap gap-1">
              {periods.map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", period === p ? "bg-brand-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10")}>{periodLabel[p]}</button>
              ))}
            </div>
          </div>
          <div data-tour="time-new" className="mt-auto flex flex-col gap-2">
            <Button onClick={() => { resetForm(); setOpen(true); }}>+ {t("new")}</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>⬇ {t("export")}</Button>
          </div>
        </Card>
      </div>

      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="col-span-full font-semibold">{editId ? t("editTitle") : t("new")}</h2>
          <Input type="date" label={t("date")} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select
            label={t("project")}
            value={form.projectId}
            onChange={(v) => setForm({ ...form, projectId: v })}
            options={[{ value: "", label: "—" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Select
            label={t("customer")}
            value={form.customerId}
            onChange={(v) => setForm({ ...form, customerId: v })}
            options={[{ value: "", label: "—" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Input type="number" step="0.25" label={t("hours")} value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
          <Input type="number" step="0.01" label={t("hourlyRate")} value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })} />
          <Input label={t("description")} className="col-span-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          <div className="col-span-full flex gap-2">
            <Button type="submit" disabled={saving || !form.description}>{saving ? "..." : t("save")}</Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">{t("noResults")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([key, items]) => {
            const h = items.reduce((s, e) => s + Number(e.hours), 0);
            const monthLabel = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", { month: "long", year: "numeric" }).format(new Date(key + "-01"));
            return (
              <Card key={key} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-5 py-2.5">
                  <span className="text-sm font-semibold capitalize text-slate-300">{monthLabel}</span>
                  <span className="text-xs text-slate-400">{h.toFixed(1)} u</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="text-left text-slate-400">
                      <tr>
                        <th className="px-5 py-2 font-medium">{t("date")}</th>
                        <th className="px-5 py-2 font-medium">{t("description")}</th>
                        <th className="px-5 py-2 font-medium">{t("hours")}</th>
                        <th className="px-5 py-2 font-medium">{t("status")}</th>
                        <th className="px-5 py-2 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((e) => (
                        <tr key={e.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                          <td className="px-5 py-2.5 text-slate-400">{e.date.slice(0, 10)}</td>
                          <td className="px-5 py-2.5 text-slate-200">{e.description}{(e.project || e.customer) ? <span className="ml-2 text-xs text-slate-500">· {e.project?.name ?? e.customer?.name}</span> : null}</td>
                          <td className="px-5 py-2.5 font-medium text-white">{Number(e.hours)} u</td>
                          <td className="px-5 py-2.5">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", e.status === "BILLED" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>
                              {e.status === "BILLED" ? t("billed") : t("open")}
                            </span>
                            {approvalBadge(e)}
                            {e.approval === "REJECTED" && e.rejectReason && <p className="mt-1 text-xs text-rose-300/80">{t("rejectedReason", { reason: e.rejectReason })}</p>}
                          </td>
                          <td className="px-5 py-2.5 text-right whitespace-nowrap">
                            {e.status === "OPEN" && (e.approval === "NOT_REQUIRED" || e.approval === "APPROVED") && <button onClick={() => markBilled(e.id)} className="text-xs font-medium text-emerald-400 hover:underline">{t("markBilled")}</button>}
                            {e.status === "OPEN" && e.approval === "PENDING" && canApprove && <button onClick={() => decide([e.id], "APPROVED")} className="text-xs font-medium text-emerald-400 hover:underline">{t("approve")}</button>}
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
