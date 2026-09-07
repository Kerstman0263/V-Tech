"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

export interface InboxItemSummary {
  id: string;
  fromEmail: string;
  subject: string | null;
  body: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  status: "NEW" | "PROCESSED" | "DISMISSED";
  expenseId: string | null;
  receivedAt: string;
}

/**
 * Bonnetjes-inbox: bijlagen die per e-mail zijn binnengekomen op het eigen
 * inbox-adres. "Verwerken" opent het uitgaven-formulier met de foto (en OCR).
 */
export function InboxPanel({ onProcess, refreshKey = 0 }: { onProcess: (item: InboxItemSummary & { data: string }) => void; refreshKey?: number }) {
  const t = useTranslations("expenses.inbox");
  const locale = useLocale();
  const [items, setItems] = useState<InboxItemSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/inbox?status=NEW");
    if (res.ok) setItems(await res.json());
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function process(item: InboxItemSummary) {
    setBusy(item.id);
    const res = await fetch(`/api/inbox/${item.id}`);
    setBusy(null);
    if (!res.ok) return;
    const full = (await res.json()) as InboxItemSummary & { data: string };
    onProcess(full);
  }
  async function dismiss(id: string) {
    setBusy(id);
    await fetch(`/api/inbox/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "DISMISSED" }) });
    setBusy(null);
    load();
  }

  // Niets te doen én al geladen: kleine hint i.p.v. een leeg blok.
  if (loaded && items.length === 0) {
    return (
      <p className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs text-slate-500">
        <Icon name="mail" className="h-3.5 w-3.5 text-brand-300" />
        {t("emptyHint")}
        <Link href="/settings" className="font-semibold text-brand-300 hover:underline">{t("emptyCta")}</Link>
      </p>
    );
  }
  if (!loaded) return null;

  const fmt = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

  return (
    <div data-tour="expenses-inbox">
    <Card className="overflow-hidden border-brand-500/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-brand-500/[0.06] px-5 py-3">
        <div>
          <h2 className="font-semibold text-white">
            <Icon name="mail" className="mr-2 inline h-4 w-4 align-[-3px] text-brand-300" />
            {t("title")} <span className="ml-1 rounded-full bg-brand-500/20 px-2 py-0.5 text-xs font-bold text-brand-200">{items.length}</span>
          </h2>
          <p className="text-xs text-slate-400">{t("sub")}</p>
        </div>
      </div>
      <ul className="divide-y divide-white/[0.04]">
        {items.map((it) => {
          const isImage = it.mimeType.startsWith("image/");
          return (
            <li key={it.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-white/[0.03]">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isImage ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                <Icon name={isImage ? "receipt" : "invoice"} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{it.subject || it.fileName}</p>
                <p className="truncate text-xs text-slate-500">
                  {fmt.format(new Date(it.receivedAt))} · {it.fromEmail} · {it.fileName} ({kb(it.size)})
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => process(it)} disabled={busy === it.id} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-50">
                  {busy === it.id ? "…" : t("process")}
                </button>
                <button onClick={() => dismiss(it.id)} disabled={busy === it.id} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 disabled:opacity-50">
                  {t("dismiss")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
    </div>
  );
}
