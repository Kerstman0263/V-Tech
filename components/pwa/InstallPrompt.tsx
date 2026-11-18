"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { OvaEi } from "@/components/ova-ei";
import { setFloatingNotice, useFloatingNotice } from "@/components/dashboard/floating-notices";

const DISMISS_KEY = "saldova-pwa-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Zet Saldova op je beginscherm" — alleen op telefoon/tablet, alleen in de
 * browser (niet als de app al geïnstalleerd is of in de desktop-app draait).
 * Android/Chrome: echte installatieknop. iPhone: korte uitleg (Safari heeft
 * geen installatie-API). Eén keer wegklikken = 30 dagen stil.
 */
export function InstallPrompt() {
  const t = useTranslations("pwa");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  // Staat de update-melding er al, dan wachten we tot die weg is (anders overlappen ze).
  const otherNotice = useFloatingNotice("install");
  const visible = mode !== "hidden" && !otherNotice;

  // Aanmelden als zwevende melding: de hulpknop verbergt zich zolang deze melding staat.
  useEffect(() => {
    setFloatingNotice("install", visible);
    return () => setFloatingNotice("install", false);
  }, [visible]);

  useEffect(() => {
    try {
      const dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (Date.now() - dismissed < 30 * 86_400_000) return;
    } catch {
      /* localStorage geblokkeerd: dan geen melding */
    }
    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    if (standalone || !mobile || ua.includes("SaldovaDesktop")) return;

    const isIos = /iPhone|iPad|iPod/.test(ua);
    if (isIos) {
      setMode("ios");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* negeren */
    }
    setMode("hidden");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setMode("hidden");
    else dismiss();
  }

  if (!visible) return null;

  return (
    <div role="status" className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[75] rounded-2xl border border-rand bg-kaart p-4 shadow-2xl shadow-black/60 backdrop-blur-md md:hidden">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-grond ring-1 ring-rand">
          <OvaEi merk="saldova" className="h-6 w-auto" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{t("title")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{mode === "ios" ? t("iosHint") : t("androidHint")}</p>
          <div className="mt-2.5 flex items-center gap-3">
            {mode === "android" && (
              <button onClick={install} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:bg-brand-500">
                {t("install")}
              </button>
            )}
            <button onClick={dismiss} className="min-h-9 text-xs font-medium text-slate-400 hover:text-slate-200">
              {t("dismiss")}
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label={t("dismiss")} className="-m-1 rounded-lg p-1 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]">
          <Icon name="x-circle" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
