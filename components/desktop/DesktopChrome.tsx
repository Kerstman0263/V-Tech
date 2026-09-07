"use client";

import { useEffect, useState } from "react";

/**
 * Sleepstrook voor de desktop-app. Het venster is randloos (geen Windows-
 * titelbalk); deze onzichtbare strook bovenaan maakt het versleepbaar op
 * pagina's zonder eigen sleepbare header (login, registratie, upgrade-poort).
 * Rendert niets in de browser — alleen in de Saldova desktop-shell.
 * Na hydration pas tonen (voorkomt een server/client-mismatch).
 */
export function DesktopChrome({ height = 40 }: { height?: number }) {
  const [inDesktop, setInDesktop] = useState(false);

  useEffect(() => {
    setInDesktop(typeof navigator !== "undefined" && navigator.userAgent.includes("SaldovaDesktop"));
  }, []);

  if (!inDesktop) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        // Rechts ruimte laten voor de venster-knoppen (minimaliseren/sluiten)
        right: 150,
        height,
        zIndex: 50,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    />
  );
}
