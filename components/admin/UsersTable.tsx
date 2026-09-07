"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";

type Role = "USER" | "ADMIN" | "OWNER";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  company: { name: string | null } | null;
  accountType?: "ZZP" | "BEDRIJF";
  role: Role;
  createdAt: string;
  ownerId?: string | null;
  subscription: { plan: string; status: string } | null;
  _count: { invoices: number; customers: number };
}

const PLANS = ["FREE", "GROWTH", "PRO", "BUSINESS", "BUSINESS_PLUS"] as const;

const planStyle: Record<string, string> = {
  FREE: "bg-white/5 text-slate-400",
  GROWTH: "bg-blue-500/15 text-blue-300",
  PRO: "bg-brand-500/15 text-brand-300",
  BUSINESS: "bg-teal-500/15 text-teal-300",
  BUSINESS_PLUS: "bg-amber-500/15 text-amber-300",
};

const roleStyle: Record<Role, string> = {
  OWNER: "bg-amber-400 text-amber-950",
  ADMIN: "bg-brand-600 text-white",
  USER: "bg-white/5 text-slate-400",
};

type TypeFilter = "ALL" | "OWNERS" | "MEMBERS";
type Sort = "new" | "old" | "invoices";

export function UsersTable({ users, viewerRole = "ADMIN" }: { users: AdminUser[]; viewerRole?: Role }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  // Zoeken / filteren / sorteren — puur client-side, de lijst is al geladen.
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<string>("ALL");
  const [type, setType] = useState<TypeFilter>("ALL");
  const [sort, setSort] = useState<Sort>("new");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users.filter((u) => {
      if (type === "OWNERS" && u.ownerId) return false;
      if (type === "MEMBERS" && !u.ownerId) return false;
      if (plan !== "ALL" && (u.ownerId || (u.subscription?.plan ?? "FREE") !== plan)) return false;
      if (!q) return true;
      return [u.company?.name, u.name, u.email].some((v) => v?.toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      if (sort === "invoices") return b._count.invoices - a._count.invoices;
      const d = a.createdAt.localeCompare(b.createdAt);
      return sort === "new" ? -d : d;
    });
  }, [users, query, plan, type, sort]);

  async function patch(id: string, body: Record<string, string>) {
    setBusy(id);
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? t("error"));
    }
    setBusy(null);
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setBusy(id);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? t("error"));
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div>
      {/* Werkbalk: zoeken + filters + sortering */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3">
        <Input placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
        <Select
          className="w-44"
          value={plan}
          onChange={(v) => setPlan(v)}
          options={[{ value: "ALL", label: t("filterAllPlans") }, ...PLANS.map((p) => ({ value: p, label: p }))]}
        />
        <Select
          className="w-52"
          value={type}
          onChange={(v) => setType(v as TypeFilter)}
          options={[
            { value: "ALL", label: t("filterAllTypes") },
            { value: "OWNERS", label: t("filterOwners") },
            { value: "MEMBERS", label: t("filterMembers") },
          ]}
        />
        <Select
          className="w-44"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          options={[
            { value: "new", label: t("sortNew") },
            { value: "old", label: t("sortOld") },
            { value: "invoices", label: t("sortInvoices") },
          ]}
        />
        <span className="ml-auto text-xs text-slate-500">{t("results", { count: rows.length })}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[0.03] text-left text-slate-400">
            <tr>
              <th className="px-5 py-2.5 font-medium">{t("company")}</th>
              <th className="px-5 py-2.5 font-medium">{t("role")}</th>
              <th className="px-5 py-2.5 font-medium">{t("panelType")}</th>
              <th className="px-5 py-2.5 font-medium">{t("plan")}</th>
              <th className="px-5 py-2.5 font-medium">{t("invoiceCount")}</th>
              <th className="px-5 py-2.5 font-medium">{t("registered")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">{t("noResults")}</td>
              </tr>
            )}
            {rows.map((u) => {
              const displayName = u.company?.name ?? u.name ?? u.email;
              const initials = displayName.slice(0, 2).toUpperCase();
              const isMember = !!u.ownerId;
              // De eigenaar is onaantastbaar; admin-rijen mag alleen de eigenaar beheren.
              const mayManage = u.role === "OWNER" ? false : u.role === "ADMIN" ? viewerRole === "OWNER" : true;
              const mayChangeRole = viewerRole === "OWNER" && u.role !== "OWNER" && !isMember;
              return (
                <tr key={u.id} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xs font-bold text-white">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {u.company?.name ?? u.name ?? "—"}
                          {isMember && <span className="ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{t("memberBadge")}</span>}
                        </p>
                        <p className="truncate text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {mayChangeRole ? (
                      <Select
                        value={u.role}
                        disabled={busy === u.id}
                        onChange={(v) => patch(u.id, { role: v })}
                        options={[
                          { value: "USER", label: t("roles.USER") },
                          { value: "ADMIN", label: t("roles.ADMIN") },
                        ]}
                        buttonClassName={cn("inline-flex items-center gap-1 rounded-full border-0 px-2 py-1 text-xs font-medium outline-none ring-1 ring-inset ring-black/5", roleStyle[u.role])}
                      />
                    ) : (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", roleStyle[u.role])}>
                        {t(`roles.${u.role}`)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {/* Paneel (zzp/bedrijf): alleen een beheerder wisselt dit; het abonnement volgt automatisch */}
                    {isMember ? (
                      <span className="text-xs text-slate-500">—</span>
                    ) : (
                      <Select
                        value={u.accountType ?? "ZZP"}
                        disabled={busy === u.id || !mayManage}
                        onChange={(v) => { if (v !== (u.accountType ?? "ZZP") && confirm(t("typeSwitchConfirm"))) patch(u.id, { accountType: v }); }}
                        options={[{ value: "ZZP", label: t("typeZzp") }, { value: "BEDRIJF", label: t("typeBedrijf") }]}
                        buttonClassName={cn("inline-flex items-center gap-1 rounded-full border-0 px-2 py-1 text-xs font-medium outline-none ring-1 ring-inset ring-black/5", (u.accountType ?? "ZZP") === "BEDRIJF" ? "bg-blue-500/15 text-blue-300" : "bg-violet-500/15 text-violet-300", !mayManage && "opacity-60")}
                      />
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {isMember ? (
                      <span className="text-xs text-slate-500">—</span>
                    ) : (
                      <Select
                        value={u.subscription?.plan ?? "FREE"}
                        disabled={busy === u.id || !mayManage}
                        onChange={(v) => patch(u.id, { plan: v })}
                        options={PLANS.map((p) => ({ value: p, label: p }))}
                        buttonClassName={cn("inline-flex items-center gap-1 rounded-full border-0 px-2 py-1 text-xs font-medium outline-none ring-1 ring-inset ring-black/5", planStyle[u.subscription?.plan ?? "FREE"], !mayManage && "opacity-60")}
                      />
                    )}
                  </td>
                  <td className="tabular px-5 py-3 text-slate-400">{u._count.invoices}</td>
                  <td className="px-5 py-3 text-slate-400">{u.createdAt.slice(0, 10)}</td>
                  <td className="px-5 py-3 text-right">
                    {mayManage ? (
                      <button onClick={() => remove(u.id)} disabled={busy === u.id} className="text-xs font-medium text-rose-400 hover:underline disabled:opacity-50">
                        {t("delete")}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
