"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

// Downloadkaart: alle facturen + uitgaven van een jaar als één CSV voor je
// boekhouder. De export zelf gebeurt server-side (zie /api/exports/accountant).
export function AccountantExport({ currentYear }: { currentYear: number }) {
  const t = useTranslations("vat");
  const [year, setYear] = useState(currentYear);
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
          <Icon name="download" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-white">{t("exportTitle")}</h2>
          <p className="mt-0.5 max-w-md text-sm text-slate-400">{t("exportDesc")}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          {years.map((y) => (
            <option key={y} value={y} className="bg-[#12112a] text-white">{y}</option>
          ))}
        </select>
        <a
          href={`/api/exports/accountant?year=${year}`}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-500 hover:shadow-glow-md"
        >
          <Icon name="download" className="h-4 w-4" />
          {t("exportButton")}
        </a>
        <a href={`/api/exports/auditfile?year=${year}&format=xaf`} title={t("exportXafDesc")} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition-all hover:bg-white/[0.05]">
          {t("exportXaf")}
        </a>
        <a href={`/api/exports/auditfile?year=${year}&format=csv`} title={t("exportJournalDesc")} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition-all hover:bg-white/[0.05]">
          {t("exportJournal")}
        </a>
      </div>
    </Card>
  );
}
