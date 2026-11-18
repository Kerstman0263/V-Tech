"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/Card";

export interface InboxItemSummary {
  id: string; fromEmail: string; subject: string | null; body: string | null;
  fileName: string; mimeType: string; size: number;
  status: "NEW" | "PROCESSED" | "DISMISSED";
  expenseId: string | null; receivedAt: string;
}

export function InboxPanel({ onProcess, refreshKey = 0 }: { onProcess: (item: InboxItemSummary & { data: string }) => void; refreshKey?: number }) {
  const t = useTranslations("expenses.inbox");
  const locale = useLocale();
  const [items, setItems] = useState<InboxItemSummary[]>([]);
  const [status, setStatus] = useState("NEW");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox?status=${status}`, { signal });
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (!signal?.aborted) setItems(result);
    } catch { if (!signal?.aborted) setError(t("error")); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [status, t]);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load, refreshKey]);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { await action(); } catch (err) { setError(err instanceof Error && err.message ? err.message : t("error")); }
    finally { locked.current = false; setBusy(false); }
  }
  async function changeStatus(id: string, next: string) {
    await run(async () => {
      const res = await fetch(`/api/inbox/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!res.ok) throw new Error(t("error"));
      await load();
    });
  }
  async function upload(file?: File) {
    if (!file) return;
    await run(async () => {
      if (file.size > 2_000_000) throw new Error(t("uploadHint"));
      const body = new FormData(); body.set("file", file);
      const res = await fetch("/api/inbox", { method: "POST", body });
      if (!res.ok) throw new Error(t("uploadError"));
      if (status === "NEW") await load(); else setStatus("NEW");
    });
  }
  return <div data-tour="expenses-inbox" aria-busy={busy || loading}><Card className="overflow-hidden border-brand-500/20">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 bg-brand-500/[0.06] p-5">
      <div><h2 className="font-semibold text-white">{t("title")}</h2><p className="mt-1 text-sm text-slate-400">{t("sub")}</p>
        <Link href="/settings" className="text-xs text-brand-300 underline">{t("emptyCta")}</Link></div>
      <div><label className={`inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-brand-300 ${busy ? "opacity-50" : "cursor-pointer hover:bg-brand-500"}`}>
        {busy ? t("working") : t("upload")}
        <input type="file" className="sr-only" aria-label={t("upload")} accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy || loading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      </label><p className="mt-2 text-xs text-slate-400">{t("uploadHint")}</p></div>
    </div>
    <div className="flex flex-wrap gap-2 px-5 pt-4" aria-label={t("filter")}>
      {["NEW", "PROCESSED", "DISMISSED", "ALL"].map((s) => <button key={s} type="button" disabled={busy} aria-pressed={s === status} onClick={() => { setStatus(s); setError(null); }} className={`rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50 ${s === status ? "bg-brand-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{t(`statuses.${s}`)}</button>)}
    </div>
    {error && <p role="alert" className="px-5 pt-4 text-sm text-rose-300">{error} <button type="button" onClick={() => { setError(null); void load(); }} className="underline">{t("retry")}</button></p>}
    {loading ? <p role="status" className="p-5 text-sm text-slate-400">{t("loading")}</p> : items.length === 0 ? <p className="p-5 text-sm text-slate-400">{t("emptyList")}</p> : <ul className="mt-3 divide-y divide-white/5">
      {items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{item.subject || item.fileName}</p>
          <p className="mt-1 text-xs text-slate-400">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(item.receivedAt))} · {Math.max(1, Math.round(item.size / 1024))} kB · {t(`statuses.${item.status}`)}</p></div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <a href={`/api/inbox/${item.id}/file`} className="text-brand-300 underline">{t("original")}</a>
          {item.status === "NEW" && <><button disabled={busy} className="rounded-lg bg-brand-600 px-3 py-2 text-white disabled:opacity-50" onClick={() => void run(async () => { const res = await fetch(`/api/inbox/${item.id}`); if (!res.ok) throw new Error(t("error")); onProcess(await res.json()); })}>{t("process")}</button>
            <button disabled={busy} className="text-slate-300 underline disabled:opacity-50" onClick={() => void changeStatus(item.id, "DISMISSED")}>{t("dismiss")}</button></>}
          {item.status === "DISMISSED" && <button disabled={busy} className="text-brand-300 underline disabled:opacity-50" onClick={() => void changeStatus(item.id, "NEW")}>{t("restore")}</button>}
        </div>
      </li>)}
    </ul>}
    <p className="border-t border-white/5 px-5 py-3 text-xs text-slate-400">{t("limitNote")}</p>
  </Card></div>;
}
