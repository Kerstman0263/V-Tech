"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Herinnering bovenaan het dashboard zolang het e-mailadres niet bevestigd
// is, plus een korte bevestiging na het klikken op de link (?verified=1).
export function VerifyEmailBanner({ email, unverified }: { email: string; unverified: boolean }) {
  const t = useTranslations("auth.verify");
  const [justVerified, setJustVerified] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("verified") === "1") {
      setJustVerified(true);
      url.searchParams.delete("verified");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  async function resend() {
    setState("sending");
    try {
      const res = await fetch("/api/account/verify-email", { method: "POST" });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (justVerified) {
    return (
      <p role="status" className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        {t("done")}
      </p>
    );
  }
  if (!unverified) return null;

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
      <p>{t("banner", { email })}</p>
      <button
        type="button"
        onClick={resend}
        disabled={state === "sending" || state === "sent"}
        className="shrink-0 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/10 disabled:opacity-60"
      >
        {state === "sent" ? t("sent") : state === "error" ? t("error") : state === "sending" ? "..." : t("resend")}
      </button>
    </div>
  );
}
