"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { Icon } from "@/components/ui/Icon";
import { isDemoLocked, readApiBody } from "@/components/dashboard/api-error";

/** Download van alle accountgegevens (JSON). Een API-route, geen pagina: daarom een gewone <a>. */
const EXPORT_HREF = "/api/account/export";

// AVG: gegevens exporteren + account permanent verwijderen.
// Verwijderen vraagt eerst om de export (fiscale bewaarplicht van 7 jaar) en
// daarna om het wachtwoord: een geleende of gestolen sessie mag nooit in één
// klik de complete administratie kunnen wissen.
export function DangerZone({ isOwner = true }: { isOwner?: boolean }) {
  const t = useTranslations("settings");
  const tx = useTranslations("appExtra.deleteAccount");
  const te = useTranslations("appExtra.errors");
  const [confirming, setConfirming] = useState(false);
  const [exported, setExported] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkId = useId();
  const passwordId = useId();

  // De export is alleen voor de eigenaar van het account; een teamlid verwijdert
  // alleen zijn eigen login, de administratie blijft bij de eigenaar.
  const needsExport = isOwner;
  const ready = !needsExport || exported;

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !ready) return;
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, exportConfirmed: needsExport ? exported : true }),
    });
    if (res.ok) {
      await signOut({ callbackUrl: "/" });
      return;
    }
    const data = await readApiBody(res);
    setDeleting(false);
    setError(
      isDemoLocked(res.status, data)
        ? te("demoLocked")
        : data?.error === "wrong_password"
          ? t("deletePasswordWrong")
          : data?.code === "export_required"
            ? tx("exportRequired")
            : t("deleteError"),
    );
  }

  const downloadLink =
    "inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]";

  return (
    <div className="flex flex-col gap-4">
      {/* Gegevensexport (alleen de eigenaar; de export bevat de hele administratie) */}
      {isOwner && (
        <div data-tour="settings-export" className="rounded-2xl border border-white/[0.06] bg-kaart p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name="download" className="h-4 w-4" /></span>
            <h2 className="font-semibold text-white">{t("exportTitle")}</h2>
          </div>
          <p className="mt-2 text-sm text-slate-400">{t("exportDesc")}</p>
          <a href={EXPORT_HREF} download className={`mt-4 ${downloadLink}`}>
            <Icon name="download" className="h-4 w-4" /> {t("exportData")}
          </a>
        </div>
      )}

      {/* Account verwijderen */}
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300"><Icon name="alert" className="h-4 w-4" /></span>
          <h2 className="font-semibold text-rose-300">{t("dangerTitle")}</h2>
        </div>
        <p className="mt-2 max-w-lg text-sm text-slate-300">{t("deleteDesc")}</p>

        {needsExport && (
          <div className="mt-4 max-w-lg rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-4">
            <p className="text-sm font-semibold text-amber-200">{tx("retentionTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{tx("retentionBody")}</p>
            <a href={EXPORT_HREF} download className={`mt-3 ${downloadLink}`}>
              <Icon name="download" className="h-4 w-4" /> {tx("downloadFirst")}
            </a>
            <div className="mt-3 flex items-start gap-2.5">
              <input
                id={checkId}
                type="checkbox"
                checked={exported}
                onChange={(e) => setExported(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-rose-500"
              />
              <label htmlFor={checkId} className="text-sm text-slate-200">
                {tx("exportedCheck")}
              </label>
            </div>
          </div>
        )}

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!ready}
            className="mt-4 min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("deleteAccount")}
          </button>
        ) : (
          <form onSubmit={deleteAccount} className="mt-4 max-w-md rounded-xl border border-rose-500/25 bg-kaart p-4">
            <p className="text-sm font-semibold text-white">{t("deleteConfirm2")}</p>
            <label htmlFor={passwordId} className="mt-3 block text-xs font-medium text-slate-300">{t("deletePasswordLabel")}</label>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("deletePasswordPlaceholder")}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-rose-500 focus-visible:ring-2 focus-visible:ring-rose-500/40"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-rose-300">
                {error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={deleting || !password || !ready}
                className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50"
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
                className="min-h-11 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]"
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
