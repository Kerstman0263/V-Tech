"use client";

import { useEffect } from "react";

/**
 * Registreert de service worker (public/sw.js) zodat Saldova installeerbaar
 * is als app op telefoon en desktop-browser, en een offline-scherm heeft.
 * Niet in de Electron-desktop-app (die heeft zijn eigen offline-scherm) en
 * niet in development (anders blijft een oude versie hangen tijdens bouwen).
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (navigator.userAgent.includes("SaldovaDesktop")) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* geen SW = gewoon de website; geen blokkade */
    });
  }, []);
  return null;
}
