"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

/**
 * Instellingen → "Bonnetjes per e-mail": toont het eigen inbox-adres, met
 * kopiëren en vernieuwen. Zolang het inbound-domein nog niet live is, staat
 * er een duidelijke "binnenkort"-melding bij (het adres is al wel gereserveerd).
 */
export function InboundMailCard() {
  const t = useTranslations("settings.inbound");
  const [address, setAddress] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/account/inbound-address")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setAddress(d.address); setActive(!!d.active); } })
      .catch(() => {});
  }, []);

  async function copy() {
    if (!address) return;
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* geen clipboard */ }
  }
  async function rotate() {
    if (!confirm(t("rotateConfirm"))) return;
    setBusy(true);
    const res = await fetch("/api/account/inbound-address", { method: "POST" });
    setBusy(false);
    if (res.ok) { const d = await res.json(); setAddress(d.address); setActive(!!d.active); }
  }

  return (
    <div data-tour="settings-inbound" className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name="mail" className="h-4 w-4" /></span>
        <h2 className="font-semibold text-white">{t("title")}</h2>
        {!active && <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">{t("soonBadge")}</span>}
      </div>
      <p className="text-sm text-slate-400">{t("intro")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-brand-100">{address ?? "…"}</code>
        <Button variant="secondary" onClick={copy} disabled={!address}>{copied ? t("copied") : t("copy")}</Button>
      </div>

      <ul className="mt-4 space-y-1.5 text-xs text-slate-400">
        <li className="flex gap-2"><span className="text-brand-300">1.</span>{t("step1")}</li>
        <li className="flex gap-2"><span className="text-brand-300">2.</span>{t("step2")}</li>
        <li className="flex gap-2"><span className="text-brand-300">3.</span>{t("step3")}</li>
      </ul>
      <p className="mt-3 text-xs text-slate-500">{t("security")}</p>
      {!active && <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">{t("soonNote")}</p>}

      <div className="mt-4">
        <button onClick={rotate} disabled={busy || !address} className="text-xs font-medium text-slate-500 hover:text-rose-300 disabled:opacity-50">{t("rotate")}</button>
      </div>
    </div>
  );
}
