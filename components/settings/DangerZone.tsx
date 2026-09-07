"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { Icon } from "@/components/ui/Icon";

// AVG: gegevens exporteren + account permanent verwijderen.
// Verwijderen vraagt om het wachtwoord: een geleende of gestolen sessie mag
// nooit in één klik de complete administratie kunnen wissen.
export function DangerZone() {
  const t = useTranslations("settings");
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function exportData() {
    window.location.href = "/api/account/export";
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      await signOut({ callbackUrl: "/" });
      return;
    }
    const data = await res.json().catch(() => null);
    setDeleting(false);
    setError(data?.error === "wrong_password" ? t("deletePasswordWrong") : t("deleteError"));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Gegevensexport */}
      <div data-tour="settings-export" className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name="download" className="h-4 w-4" /></span>
          <h2 className="font-semibold text-white">{t("exportTitle")}</h2>
        </div>
        <p className="mt-2 text-sm text-slate-400">{t("exportDesc")}</p>
        <button
          onClick={exportData}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
        >
          <Icon name="download" className="h-4 w-4" /> {t("exportData")}
        </button>
      </div>

      {/* Account verwijderen */}
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300"><Icon name="alert" className="h-4 w-4" /></span>
          <h2 className="font-semibold text-rose-300">{t("dangerTitle")}</h2>
        </div>
        <p className="mt-2 max-w-lg text-sm text-slate-400">{t("deleteDesc")}</p>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-500 hover:shadow-[0_0_18px_rgba(244,63,94,0.35)] active:scale-[0.98]"
          >
            {t("deleteAccount")}
          </button>
        ) : (
          <form onSubmit={deleteAccount} className="mt-4 max-w-md rounded-xl border border-rose-500/25 bg-[#12112a]/70 p-4">
            <p className="text-sm font-semibold text-white">{t("deleteConfirm2")}</p>
            <label className="mt-3 block text-xs font-medium text-slate-300">{t("deletePasswordLabel")}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("deletePasswordPlaceholder")}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-rose-400">
                {error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={deleting || !password}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-500 disabled:opacity-50"
              >
                {deleting ? t("deleting") : t("deleteAccount")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                  setError(null);
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.05]"
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
