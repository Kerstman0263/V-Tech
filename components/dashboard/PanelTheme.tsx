"use client";

import { useEffect } from "react";

/**
 * Zet het paneel-accent op <html>, zodat óók componenten die via een portal
 * buiten de layout-root renderen (rondleiding, Ctrl+K-zoekvenster, toasts)
 * de paneelkleur krijgen. De root-div van de layout heeft hetzelfde attribuut
 * voor de eerste (server-)render; dit is de aanvulling voor portals.
 */
export function PanelTheme({ panel }: { panel: "zzp" | "bedrijf" }) {
  useEffect(() => {
    const el = document.documentElement;
    if (panel === "bedrijf") el.setAttribute("data-panel", "bedrijf");
    else el.removeAttribute("data-panel");
    return () => el.removeAttribute("data-panel");
  }, [panel]);
  return null;
}
