"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

interface Summary {
  total: number;
  toImport: number;
  duplicates: number;
  skipped: number;
  imported: number;
  overLimit?: number;
  preview: { name: string; email: string | null; city: string | null }[];
}

// Overstappen zonder overtypen: CSV-export van een ander pakket kiezen,
// eerst een preview (wat wordt herkend, wat is dubbel), dan pas importeren.
export function CustomerImport({ onImported }: { onImported: () => void }) {
  const t = useTranslations("customers.import");
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function send(text: string, dryRun: boolean): Promise<Summary | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t(data.error === "no_name_column" ? "errorColumns" : data.error === "too_large" ? "errorTooLarge" : "errorGeneric"));
        return null;
      }
      return data as Summary;
    } catch {
      setError(t("errorGeneric"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setDone(null);
    const text = await file.text();
    const result = await send(text, true);
    if (result) { setCsv(text); setSummary(result); }
  }

  async function confirmImport() {
    if (!csv) return;
    const result = await send(csv, false);
    if (result) {
      setDone(result.imported);
      setCsv(null);
      setSummary(null);
      onImported();
    }
  }

  return (
    <>
      <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={pick} aria-label={t("button")} tabIndex={-1} />
      <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>⬆ {t("button")}</Button>
      {(summary || error || done !== null) && (
        <div className="basis-full rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 text-sm backdrop-blur-md" role="region" aria-label={t("title")}>
          {error && <p role="alert" className="text-rose-300">{error}</p>}
          {done !== null && <p role="status" className="text-emerald-300">{t("done", { count: done })}</p>}
          {summary && (
            <div className="flex flex-col gap-3">
              <p className="font-semibold text-white">{t("title")}</p>
              <p className="text-slate-300">{t("summary", { toImport: summary.toImport, duplicates: summary.duplicates, skipped: summary.skipped })}</p>
              {!!summary.overLimit && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">{t("overLimit", { count: summary.overLimit })}</p>}
              {summary.preview.length > 0 && (
                <ul className="list-inside list-disc text-slate-400">
                  {summary.preview.map((p, i) => <li key={i}>{[p.name, p.email, p.city].filter(Boolean).join(" · ")}</li>)}
                </ul>
              )}
              <div className="flex gap-2">
                <Button onClick={confirmImport} disabled={busy || summary.toImport === 0}>{busy ? "..." : t("confirm", { count: summary.toImport })}</Button>
                <Button variant="ghost" onClick={() => { setSummary(null); setCsv(null); }}>{t("cancel")}</Button>
              </div>
            </div>
          )}
          {!summary && <p className="mt-2 text-xs text-slate-500">{t("hint")}</p>}
        </div>
      )}
    </>
  );
}
