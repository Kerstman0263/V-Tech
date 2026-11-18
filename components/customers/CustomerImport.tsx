"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { IMPORT_MAX_BYTES } from "@/lib/customer-import";

interface Summary {
  total: number;
  toImport: number;
  duplicates: number;
  skipped: number;
  imported: number;
  overLimit: number;
  mapped: Record<string, string>;
  skippedRows: { line: number; reason: "no_name" | "invalid_email" | "invalid_country" | "malformed" }[];
  preview: { name: string; email: string | null; city: string | null }[];
}

class ImportError extends Error {}

export function CustomerImport({ onImported }: { onImported: () => void | Promise<void> }) {
  const t = useTranslations("customers.import");
  const input = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const [selection, setSelection] = useState<{ csv: string; summary: Summary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Summary | null>(null);

  async function request(csv: string, dryRun: boolean): Promise<Summary> {
    const res = await fetch("/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, dryRun }),
    });
    const data = await res.json();
    if (!res.ok) {
      const errors: Record<string, string> = { no_name_column: "errorColumns", too_large: "errorTooLarge", too_many_rows: "errorRows" };
      throw new ImportError(t(errors[data.error] ?? "errorGeneric"));
    }
    return data as Summary;
  }

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || locked.current) return;
    locked.current = true;
    setBusy(true);
    setSelection(null);
    setDone(null);
    setError(null);
    try {
      if (file.size > IMPORT_MAX_BYTES) throw new ImportError(t("errorTooLarge"));
      const csv = await file.text();
      const summary = await request(csv, true);
      setSelection({ csv, summary });
    } catch (error) {
      setError(error instanceof ImportError ? error.message : t("errorGeneric"));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!selection || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await request(selection.csv, false);
      setDone(result);
      setSelection(null);
      await onImported();
    } catch (error) {
      setError(error instanceof ImportError ? error.message : t("errorGeneric"));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const summary = selection?.summary;
  return <>
    <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={pick} aria-label={t("button")} disabled={busy} tabIndex={-1} />
    <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>{busy ? t("working") : t("button")}</Button>
    {(summary || error || done) && <div className="basis-full rounded-2xl border border-white/10 bg-[#12112a]/60 p-5 text-sm" role="region" aria-label={t("title")} aria-busy={busy}>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {done && <div role="status" className="space-y-2">
        <p className="font-semibold text-emerald-300">{t("done", { count: done.imported })}</p>
        <p className="text-slate-300">{t("result", { duplicates: done.duplicates, skipped: done.skipped, overLimit: done.overLimit })}</p>
      </div>}
      {summary && <div className="flex flex-col gap-3">
        <h3 className="font-semibold text-white">{t("title")}</h3>
        <p className="text-slate-300">{t("summary", { toImport: summary.toImport, duplicates: summary.duplicates, skipped: summary.skipped })}</p>
        <p className="text-xs text-slate-400">{t("mapped", { columns: Object.values(summary.mapped).join(", ") })}</p>
        {summary.overLimit > 0 && <p className="rounded-lg bg-amber-500/10 p-3 text-amber-200">{t("overLimit", { count: summary.overLimit })}</p>}
        {summary.preview.length > 0 && <p className="text-xs text-slate-400">{t("previewHint")}</p>}
        {summary.preview.length > 0 && <ul className="list-inside list-disc text-slate-300">
          {summary.preview.map((customer, index) => <li key={index}>{[customer.name, customer.email, customer.city].filter(Boolean).join(" · ")}</li>)}
        </ul>}
        {summary.skippedRows.length > 0 && <details className="text-slate-300">
          <summary className="cursor-pointer">{t("skippedDetails")}</summary>
          <ul className="mt-2 space-y-1 text-xs">{summary.skippedRows.map((row) => <li key={row.line}>{t("skippedLine", { line: row.line, reason: t(`reasons.${row.reason}`) })}</li>)}</ul>
        </details>}
        <p className="text-xs text-slate-400">{t("privacy")}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={confirmImport} disabled={busy || summary.toImport === 0}>{busy ? t("working") : t("confirm", { count: summary.toImport })}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { setSelection(null); setError(null); }}>{t("cancel")}</Button>
        </div>
      </div>}
      {!summary && <p className="mt-2 text-xs text-slate-400">{t("hint")}</p>}
    </div>}
  </>;
}
