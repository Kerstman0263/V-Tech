"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";

type LeaveType = "VACATION" | "SICK" | "SPECIAL";
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

interface LeaveRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  hours: number;
  note: string | null;
  status: LeaveStatus;
  decidedBy: string | null;
  createdAt: string;
}

interface Balance {
  employeeId: string;
  name: string;
  totalHours: number;
  usedHours: number;
  pendingHours: number;
  remainingHours: number;
}

interface LeaveData {
  isBoss: boolean;
  year: number;
  meId: string;
  requests: LeaveRequest[];
  balances: Balance[];
}

const STATUS_STYLE: Record<LeaveStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-300",
  APPROVED: "bg-emerald-500/15 text-emerald-300",
  REJECTED: "bg-rose-500/15 text-rose-300",
  CANCELLED: "bg-white/5 text-slate-400",
};

const TYPE_ICON: Record<LeaveType, IconName> = {
  VACATION: "sun",
  SICK: "thermometer",
  SPECIAL: "heart",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function LeaveManager() {
  const t = useTranslations("leave");
  const [data, setData] = useState<LeaveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulier nieuwe aanvraag
  const [type, setType] = useState<LeaveType>("VACATION");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [hours, setHours] = useState("8");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/leave");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, startDate, endDate, hours: Number(hours), note: note || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? t("errorGeneric"));
      return;
    }
    setNote("");
    setHours("8");
    await load();
  }

  async function decide(id: string, action: "APPROVE" | "REJECT" | "CANCEL") {
    await fetch(`/api/leave/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
  }

  async function saveBudget(employeeId: string, year: number, totalHours: number) {
    await fetch("/api/leave/balance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, year, totalHours }),
    });
    await load();
  }

  if (!data) {
    return <div className="py-16 text-center text-sm text-slate-500">{t("loading")}</div>;
  }

  const me = data.balances.find((b) => b.employeeId === data.meId);
  const pending = data.requests.filter((r) => r.status === "PENDING");
  const today = todayStr();
  const absentToday = data.requests.filter(
    (r) => r.status === "APPROVED" && r.startDate <= today && r.endDate >= today,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Mijn saldo */}
      {me && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-tour="leave-balance">
          {(
            [
              { label: t("balanceTotal", { year: data.year }), value: me.totalHours, accent: "text-white" },
              { label: t("balanceUsed"), value: me.usedHours, accent: "text-brand-300" },
              { label: t("balancePending"), value: me.pendingHours, accent: "text-amber-400" },
              { label: t("balanceLeft"), value: me.remainingHours, accent: "text-emerald-400" },
            ] as const
          ).map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{s.label}</p>
              <p className={cn("mt-1 text-2xl font-bold", s.accent)}>
                {s.value} <span className="text-sm font-medium text-slate-500">{t("hoursUnit")}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Vandaag afwezig (voor de baas) */}
      {data.isBoss && absentToday.length > 0 && (
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-200">
          <strong>{t("absentToday")}:</strong>{" "}
          {absentToday.map((r) => `${r.requesterName} (${t(`type${r.type}`)})`).join(", ")}
        </div>
      )}

      {/* Nieuwe aanvraag */}
      <form onSubmit={submitRequest} className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-6 shadow-card" data-tour="leave-request">
        <h2 className="font-semibold text-white">{data.isBoss ? t("newLeaveBoss") : t("newLeave")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label={t("fieldType")}
            value={type}
            onChange={(v) => setType(v as LeaveType)}
            options={[
              { value: "VACATION", label: t("typeVACATION") },
              { value: "SICK", label: t("typeSICK") },
              { value: "SPECIAL", label: t("typeSPECIAL") },
            ]}
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-300">{t("fieldStart")}</span>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors [color-scheme:dark] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-300">{t("fieldEnd")}</span>
            <input
              type="date"
              required
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors [color-scheme:dark] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-300">{t("fieldHours")}</span>
            <input
              type="number"
              required
              min="0.5"
              step="0.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors [color-scheme:dark] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-300">{t("fieldNote")}</span>
            <input
              type="text"
              value={note}
              maxLength={500}
              placeholder={t("notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors [color-scheme:dark] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? t("submitting") : t("submit")}
        </button>
      </form>

      {/* Te beoordelen (baas) */}
      {data.isBoss && pending.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-[#12112a]/60 backdrop-blur-md p-6 shadow-card">
          <h2 className="font-semibold text-white">
            {t("toReview")} <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">{pending.length}</span>
          </h2>
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name={TYPE_ICON[r.type]} className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">
                    {r.requesterName} — {t(`type${r.type}`)}, {r.hours} {t("hoursUnit")}
                  </p>
                  <p className="text-xs text-slate-400">
                    {r.startDate} → {r.endDate}
                    {r.note ? ` · “${r.note}”` : ""}
                  </p>
                </div>
                <button
                  onClick={() => decide(r.id, "APPROVE")}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {t("approve")}
                </button>
                <button
                  onClick={() => decide(r.id, "REJECT")}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  {t("reject")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Teamoverzicht met budgetten (baas) */}
      {data.isBoss && (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-6 shadow-card" data-tour="leave-budgets">
          <h2 className="font-semibold text-white">{t("teamOverview", { year: data.year })}</h2>
          <table className="mt-4 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2">{t("colName")}</th>
                <th className="pb-2">{t("colBudget")}</th>
                <th className="pb-2">{t("balanceUsed")}</th>
                <th className="pb-2">{t("balancePending")}</th>
                <th className="pb-2">{t("balanceLeft")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {data.balances.map((b) => (
                <tr key={b.employeeId}>
                  <td className="py-2.5 font-medium text-white">{b.name}</td>
                  <td className="py-2.5">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={b.totalHours}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== b.totalHours && v >= 0) saveBudget(b.employeeId, data.year, v);
                      }}
                      className="w-24 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm text-white outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />{" "}
                    <span className="text-slate-500">{t("hoursUnit")}</span>
                  </td>
                  <td className="py-2.5">{b.usedHours}</td>
                  <td className="py-2.5">{b.pendingHours}</td>
                  <td className={cn("py-2.5 font-semibold", b.remainingHours < 0 ? "text-rose-400" : "text-emerald-300")}>
                    {b.remainingHours}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">{t("budgetHint")}</p>
        </div>
      )}

      {/* Aanvragenlijst */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-6 shadow-card" data-tour="leave-requests">
        <h2 className="font-semibold text-white">{data.isBoss ? t("allRequests") : t("myRequests")}</h2>
        {data.requests.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("empty")}</p>
        ) : (
          <table className="mt-4 w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-400">
                {data.isBoss && <th className="pb-2">{t("colName")}</th>}
                <th className="pb-2">{t("fieldType")}</th>
                <th className="pb-2">{t("colPeriod")}</th>
                <th className="pb-2">{t("fieldHours")}</th>
                <th className="pb-2">{t("colStatus")}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {data.requests.map((r) => (
                <tr key={r.id}>
                  {data.isBoss && <td className="py-2.5 font-medium text-white">{r.requesterName}</td>}
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5"><Icon name={TYPE_ICON[r.type]} className="h-4 w-4 text-brand-400" />{t(`type${r.type}`)}</span>
                  </td>
                  <td className="py-2.5 text-slate-400">
                    {r.startDate} → {r.endDate}
                  </td>
                  <td className="py-2.5">{r.hours}</td>
                  <td className="py-2.5">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[r.status])}>
                      {t(`status${r.status}`)}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    {r.status === "PENDING" && (r.requesterId === data.meId || data.isBoss) && (
                      <button
                        onClick={() => decide(r.id, "CANCEL")}
                        className="text-xs font-medium text-slate-500 hover:text-rose-400"
                      >
                        {t("cancel")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
