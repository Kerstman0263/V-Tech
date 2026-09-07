"use client";
import { Icon } from "@/components/ui/Icon";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Select } from "@/components/ui/Select";

type Role = "OWNER" | "MANAGER" | "MEMBER";
type Cap = "financials" | "approveHours" | "manageTeam" | "exports";
const CAPS: Cap[] = ["financials", "approveHours", "manageTeam", "exports"];

interface Member {
  id: string; name: string; email: string; teamRole: "MEMBER" | "MANAGER"; createdAt: string;
  permissions: Cap[]; permissionsCustom: boolean; rolePermissions: Cap[]; hourlyCost: number | null;
}
interface Activity { id: string; name: string; role: Role; hours: number; km: number; invoices: number; revenue: number | null; cost: number | null }

interface TeamData {
  plan: string;
  supportsTeam: boolean;
  maxMembers: number;
  seatPrice: number;
  used: number;
  costPerMonth: number;
  isOwner: boolean;
  showCosts: boolean;
  members: Member[];
  activity: Activity[];
}

const roleStyle: Record<Role, string> = {
  OWNER: "bg-brand-600 text-white",
  MANAGER: "bg-teal-500/15 text-teal-300",
  MEMBER: "bg-white/5 text-slate-400",
};

export function TeamManager() {
  const t = useTranslations("team");
  const locale = useLocale();
  const [data, setData] = useState<TeamData | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", teamRole: "MEMBER" as "MEMBER" | "MANAGER" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/team");
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Error"); return; }
    setForm({ name: "", email: "", password: "", teamRole: "MEMBER" });
    setOpen(false);
    load();
  }
  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    const res = await fetch(`/api/team/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? "Error"); }
    load();
  }
  const changeRole = (id: string, teamRole: "MEMBER" | "MANAGER") => patch(id, { teamRole });
  // Rechtenmatrix: één vinkje omzetten -> volledige set opslaan (permissionsCustom = true)
  const toggleCap = (m: Member, cap: Cap) => {
    const next = m.permissions.includes(cap) ? m.permissions.filter((c) => c !== cap) : [...m.permissions, cap];
    return patch(m.id, { permissions: next });
  };
  const saveCost = (m: Member) => {
    const raw = costDraft[m.id];
    if (raw === undefined) return;
    const val = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (val !== null && (Number.isNaN(val) || val < 0)) return;
    if (val === m.hourlyCost) return;
    patch(m.id, { hourlyCost: val });
  };
  async function remove(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    await fetch(`/api/team/${id}`, { method: "DELETE" });
    load();
  }

  const roleLabel = (r: Role) => (r === "OWNER" ? t("roleOwner") : r === "MANAGER" ? t("roleManager") : t("roleMember"));
  const capLabel: Record<Cap, string> = { financials: t("capFinancials"), approveHours: t("capApproveHours"), manageTeam: t("capManageTeam"), exports: t("capExports") };

  if (!data) return <p className="text-sm text-slate-500">…</p>;

  if (!data.supportsTeam) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name="users" className="h-6 w-6" /></div>
        <h2 className="mt-3 text-lg font-semibold text-white">{t("upgradeTitle")}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{t("upgradeText")}</p>
        <Link href="/settings" className="mt-5 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{t("upgradeCta")}</Link>
      </Card>
    );
  }

  const seatsLeft = data.maxMembers - data.used;

  return (
    <div className="flex flex-col gap-6">
      {/* Seat-overzicht */}
      <div className="grid gap-4 sm:grid-cols-3" data-tour="team-seats">
        <StatCard label={t("seatsUsed")} value={`${data.used} / ${data.maxMembers}`} icon="users" tone="brand" />
        <StatCard label={t("seatPrice")} value={data.seatPrice > 0 ? `€ ${data.seatPrice.toFixed(2)}` : t("included")} icon="user" tone="teal" />
        <StatCard label={t("extraCost")} value={`€ ${data.costPerMonth.toFixed(2)}`} icon="euro" tone="amber" sub={t("perMonth")} />
      </div>

      {/* Toevoegen */}
      {open ? (
        <form onSubmit={add} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Input label={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t("email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label={t("password")} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          {data.isOwner && (
            <Select
              label={t("role")}
              value={form.teamRole}
              onChange={(v) => setForm({ ...form, teamRole: v as "MEMBER" | "MANAGER" })}
              options={[{ value: "MEMBER", label: t("roleMember") }, { value: "MANAGER", label: t("roleManager") }]}
            />
          )}
          {error && <p className="col-span-full text-sm text-rose-400">{error}</p>}
          <div className="col-span-full flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? "..." : t("add")}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          </div>
        </form>
      ) : (
        <div data-tour="team-add">
          <Button onClick={() => setOpen(true)} disabled={seatsLeft <= 0}>+ {t("addMember")}</Button>
          {seatsLeft <= 0 && <p className="mt-2 text-xs text-amber-400">{t("noSeatsLeft")}</p>}
        </div>
      )}

      {/* Ledenlijst met rollen */}
      {data.members.length === 0 ? (
        <p className="text-sm text-slate-400">{t("empty")}</p>
      ) : (
        <Card className="divide-y divide-white/[0.06]">
          {data.members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <Link href={`/team/${m.id}`} className="group flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 text-xs font-bold text-white">{m.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-brand-400 group-hover:underline">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.email}</p>
                </div>
              </Link>
              <div className="flex items-center gap-3">
                {data.isOwner ? (
                  <Select
                    value={m.teamRole}
                    onChange={(v) => changeRole(m.id, v as "MEMBER" | "MANAGER")}
                    options={[{ value: "MEMBER", label: t("roleMember") }, { value: "MANAGER", label: t("roleManager") }]}
                    buttonClassName={cn("inline-flex items-center gap-1 rounded-full border-0 px-2 py-1 text-xs font-medium outline-none ring-1 ring-inset ring-black/5", roleStyle[m.teamRole])}
                  />
                ) : (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", roleStyle[m.teamRole])}>{roleLabel(m.teamRole)}</span>
                )}
                <button onClick={() => remove(m.id)} className="text-xs font-medium text-rose-400 hover:underline">{t("remove")}</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Rechtenmatrix: vier vinkjes per medewerker + bruto uurloon (alleen eigenaar) */}
      {data.isOwner && data.members.length > 0 && (
        <div data-tour="team-rights">
        <Card className="overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <h2 className="font-semibold text-white">{t("matrixTitle")}</h2>
            <p className="text-xs text-slate-400">{t("matrixSub")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("name")}</th>
                  {CAPS.map((c) => <th key={c} className="px-3 py-2.5 text-center font-medium">{capLabel[c]}</th>)}
                  {data.showCosts && <th className="px-5 py-2.5 text-right font-medium">{t("hourlyCost")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.members.map((m) => (
                  <tr key={m.id} className={cn(busy === m.id && "opacity-50")}>
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-white">{m.name}</p>
                      <p className="text-xs text-slate-500">
                        {roleLabel(m.teamRole)}
                        {m.permissionsCustom ? (
                          <>
                            {" · "}<span className="text-amber-300">{t("customBadge")}</span>
                            {" · "}<button onClick={() => patch(m.id, { resetPermissions: true })} className="text-brand-400 hover:underline">{t("roleDefault")}</button>
                          </>
                        ) : null}
                      </p>
                    </td>
                    {CAPS.map((c) => (
                      <td key={c} className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${m.name}: ${capLabel[c]}`}
                          checked={m.permissions.includes(c)}
                          disabled={busy === m.id}
                          onChange={() => toggleCap(m, c)}
                          className="h-4 w-4 cursor-pointer accent-brand-500"
                        />
                      </td>
                    ))}
                    {data.showCosts && (
                      <td className="px-5 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <span className="text-xs text-slate-500">€</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="—"
                            aria-label={`${m.name}: ${t("hourlyCost")}`}
                            value={costDraft[m.id] ?? (m.hourlyCost === null ? "" : String(m.hourlyCost))}
                            onChange={(e) => setCostDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                            onBlur={() => saveCost(m)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="tabular w-20 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-right text-sm text-white outline-none focus:border-brand-500"
                          />
                          <span className="text-xs text-slate-500">/u</span>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.showCosts && <p className="border-t border-white/[0.06] px-5 py-2.5 text-xs text-slate-500">{t("hourlyCostHint")}</p>}
        </Card>
        </div>
      )}

      {/* Activiteit per medewerker (+ opbrengst/kosten/marge met financiële rechten) */}
      <div data-tour="team-activity">
      <Card className="overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="font-semibold text-white">{t("activityTitle")}</h2>
          <p className="text-xs text-slate-400">{t("activitySub")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-white/[0.03] text-left text-slate-400">
              <tr>
                <th className="px-5 py-2.5 font-medium">{t("name")}</th>
                <th className="px-5 py-2.5 font-medium">{t("role")}</th>
                <th className="px-5 py-2.5 font-medium">{t("colHours")}</th>
                <th className="px-5 py-2.5 font-medium">{t("colKm")}</th>
                <th className="px-5 py-2.5 font-medium">{t("colInvoices")}</th>
                {data.showCosts && <th className="px-5 py-2.5 text-right font-medium">{t("colRevenue")}</th>}
                {data.showCosts && <th className="px-5 py-2.5 text-right font-medium">{t("colCost")}</th>}
                {data.showCosts && <th className="px-5 py-2.5 text-right font-medium">{t("colMargin")}</th>}
              </tr>
            </thead>
            <tbody>
              {data.activity.map((a) => {
                const margin = a.revenue !== null && a.cost !== null ? a.revenue - a.cost : null;
                const pct = margin !== null && a.revenue ? Math.round((margin / a.revenue) * 100) : null;
                return (
                  <tr key={a.id} className="border-t border-white/[0.04]">
                    <td className="px-5 py-2.5 font-medium text-white">{a.name}</td>
                    <td className="px-5 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", roleStyle[a.role])}>{roleLabel(a.role)}</span></td>
                    <td className="px-5 py-2.5 text-slate-300">{a.hours.toFixed(1)} u</td>
                    <td className="px-5 py-2.5 text-slate-300">{a.km.toFixed(0)} km</td>
                    <td className="px-5 py-2.5 text-slate-300">{a.invoices}</td>
                    {data.showCosts && <td className="tabular px-5 py-2.5 text-right text-slate-300">{a.revenue === null ? "—" : formatMoney(a.revenue, locale)}</td>}
                    {data.showCosts && <td className="tabular px-5 py-2.5 text-right text-slate-300">{a.cost === null ? "—" : formatMoney(a.cost, locale)}</td>}
                    {data.showCosts && (
                      <td className={cn("tabular px-5 py-2.5 text-right font-semibold", margin === null ? "text-slate-500" : margin >= 0 ? "text-emerald-300" : "text-rose-300")}>
                        {margin === null ? "—" : `${formatMoney(margin, locale)}${pct !== null ? ` (${pct}%)` : ""}`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
    </div>
  );
}
