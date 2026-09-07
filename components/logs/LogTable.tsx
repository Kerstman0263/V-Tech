"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";

interface LogRow {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  target: string | null;
}

// Kleur per actie-categorie (het deel vóór de punt)
const CATEGORY_STYLE: Record<string, string> = {
  account: "bg-brand-500/15 text-brand-300",
  admin: "bg-amber-500/15 text-amber-300",
  team: "bg-teal-500/15 text-teal-300",
  leave: "bg-sky-500/15 text-sky-300",
  task: "bg-emerald-500/15 text-emerald-300",
  invoice: "bg-violet-500/15 text-violet-300",
  quote: "bg-fuchsia-500/15 text-fuchsia-300",
  expense: "bg-rose-500/15 text-rose-300",
};

function fmtTime(iso: string) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function LogTable({ logs }: { logs: LogRow[] }) {
  const t = useTranslations("logs");
  const [query, setQuery] = useState("");

  // Leesbare labels per actie; onbekende acties tonen de ruwe sleutel
  const labelOf = (action: string) => t.has(`actions.${action}`) ? t(`actions.${action}`) : action;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) =>
      `${l.actorName} ${labelOf(l.action)} ${l.action} ${l.target ?? ""}`.toLowerCase().includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, query]);

  return (
    <div>
      <div className="border-b border-white/[0.06] px-5 py-3">
        <Input
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-xs"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-2.5 font-medium">{t("colWhen")}</th>
                <th className="px-5 py-2.5 font-medium">{t("colWho")}</th>
                <th className="px-5 py-2.5 font-medium">{t("colWhat")}</th>
                <th className="px-5 py-2.5 font-medium">{t("colTarget")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((l) => {
                const category = l.action.split(".")[0];
                return (
                  <tr key={l.id} className="hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-400">{fmtTime(l.createdAt)}</td>
                    <td className="px-5 py-2.5 font-medium text-white">{l.actorName}</td>
                    <td className="px-5 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CATEGORY_STYLE[category] ?? "bg-white/5 text-slate-400")}>
                        {labelOf(l.action)}
                      </span>
                    </td>
                    <td className="max-w-md truncate px-5 py-2.5 text-slate-400" title={l.target ?? undefined}>{l.target ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-white/[0.06] px-5 py-2.5 text-xs text-slate-500">{t("retentionNote")}</p>
    </div>
  );
}
