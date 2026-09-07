"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

type Phase = "idle" | "scan" | "backup" | "disable";

const INPUT =
  "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Tweestapsverificatie in Instellingen.
 * Inschakelen: QR scannen -> code bevestigen -> back-upcodes bewaren.
 * Uitschakelen: wachtwoord + code (een gestolen sessie kan het dus niet
 * zomaar uitzetten).
 */
export function TwoFactorCard({ enabled: initialEnabled }: { enabled: boolean }) {
  const t = useTranslations("settings.twoFactor");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  async function startSetup() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/2fa/setup", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(t("error"));
      return;
    }
    const data = (await res.json()) as { qr: string; manualKey: string };
    setQr(data.qr);
    setManualKey(data.manualKey);
    setCode("");
    setPhase("scan");
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error === "invalid_code" ? t("invalidCode") : t("error"));
      return;
    }
    const data = (await res.json()) as { backupCodes: string[] };
    setBackupCodes(data.backupCodes);
    setEnabled(true);
    setPhase("backup");
  }

  async function confirmDisable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, code }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error === "wrong_password" ? t("wrongPassword") : data?.error === "invalid_code" ? t("invalidCode") : t("error"));
      return;
    }
    setEnabled(false);
    setPhase("idle");
    setPassword("");
    setCode("");
    router.refresh();
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* klembord geblokkeerd — de codes staan leesbaar op het scherm */
    }
  }

  function downloadCodes() {
    const blob = new Blob([`Saldova back-upcodes\n\n${backupCodes.join("\n")}\n\nElke code werkt één keer. Bewaar dit bestand veilig.\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saldova-backupcodes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function finishBackup() {
    setPhase("idle");
    setBackupCodes([]);
    setQr(null);
    router.refresh();
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl ring-1", enabled ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25" : "bg-brand-500/10 text-brand-300 ring-brand-500/20")}>
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-white">{t("title")}</h2>
            <p className="mt-0.5 text-sm text-slate-400">{t("subtitle")}</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1",
            enabled ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25" : "bg-white/5 text-slate-400 ring-white/10",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", enabled ? "bg-emerald-400" : "bg-slate-500")} />
          {enabled ? t("statusOn") : t("statusOff")}
        </span>
      </div>

      {/* Uit: uitleg + inschakelen */}
      {phase === "idle" && !enabled && (
        <div className="mt-5">
          <p className="max-w-lg text-sm leading-relaxed text-slate-400">{t("explain")}</p>
          <Button onClick={startSetup} disabled={busy} className="mt-4">
            {busy ? "..." : t("enable")}
          </Button>
        </div>
      )}

      {/* Aan: uitschakelen */}
      {phase === "idle" && enabled && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-400">{t("enabledExplain")}</p>
          <button
            onClick={() => {
              setPhase("disable");
              setError(null);
            }}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            {t("disable")}
          </button>
        </div>
      )}

      {/* Stap 1+2: scannen en bevestigen */}
      {phase === "scan" && qr && (
        <form onSubmit={confirmEnable} className="mt-5 grid gap-6 md:grid-cols-[auto_1fr]">
          <div className="justify-self-start rounded-2xl bg-white p-3 shadow-lg shadow-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={t("qrAlt")} width={220} height={220} className="block" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{t("step1")}</p>
            <p className="mt-1 text-sm text-slate-400">{t("step1Hint")}</p>
            <p className="mt-2 text-xs text-slate-500">{t("manualKey")}</p>
            <code className="mt-1 block select-all break-all rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-brand-200">{manualKey}</code>

            <p className="mt-4 text-sm font-semibold text-white">{t("step2")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123 456"
                inputMode="numeric"
                autoComplete="one-time-code"
                className={cn(INPUT, "tabular w-40 text-center text-lg tracking-[0.3em]")}
                required
              />
              <Button type="submit" disabled={busy || code.replace(/\s/g, "").length < 6}>
                {busy ? "..." : t("verify")}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setError(null);
                }}
                className="text-sm text-slate-400 transition-colors hover:text-white"
              >
                {t("cancel")}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-rose-400">
                {error}
              </p>
            )}
          </div>
        </form>
      )}

      {/* Stap 3: back-upcodes bewaren */}
      {phase === "backup" && (
        <div className="mt-5">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
            <Icon name="check-circle" className="h-5 w-5 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-200">{t("enabledNow")}</p>
          </div>
          <p className="mt-4 text-sm font-semibold text-white">{t("backupTitle")}</p>
          <p className="mt-1 max-w-lg text-sm text-slate-400">{t("backupHint")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {backupCodes.map((c) => (
              <code key={c} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-center font-mono text-xs text-white">
                {c}
              </code>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={copyCodes}>
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button type="button" variant="secondary" onClick={downloadCodes}>
              <Icon name="download" className="mr-1.5 h-4 w-4" />
              {t("download")}
            </Button>
            <Button type="button" onClick={finishBackup}>
              {t("done")}
            </Button>
          </div>
        </div>
      )}

      {/* Uitschakelen: wachtwoord + code */}
      {phase === "disable" && (
        <form onSubmit={confirmDisable} className="mt-5 max-w-md rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-sm text-slate-300">{t("disableExplain")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              className={INPUT}
              required
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("codePlaceholder")}
              autoComplete="one-time-code"
              className={cn(INPUT, "tabular")}
              required
            />
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-rose-400">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !password || !code}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-500 disabled:opacity-50"
            >
              {busy ? "..." : t("disableConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setPassword("");
                setCode("");
                setError(null);
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.05]"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
