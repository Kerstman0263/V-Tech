"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const KEY = "saldova-text-size";
const LARGE = "112.5%";
/** Houdt de kopbalk-knop en het avatarmenu gelijk als er twee schakelaars op de pagina staan. */
const EVENT = "saldova:text-size";

function apply(large: boolean) {
  document.documentElement.style.fontSize = large ? LARGE : "";
}

/**
 * "Grotere tekst": alles in de app is in rem opgebouwd, dus één schakelaar op
 * <html> maakt tekst, knoppen en velden samen groter. Keuze per apparaat.
 */
export function useTextSize(): [boolean, () => void] {
  const [large, setLarge] = useState(false);

  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(KEY) === "large";
    } catch {
      /* privémodus: standaardgrootte */
    }
    setLarge(saved);
    apply(saved);
    const onChange = (e: Event) => setLarge(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const toggle = useCallback(() => {
    const next = document.documentElement.style.fontSize !== LARGE;
    apply(next);
    try {
      localStorage.setItem(KEY, next ? "large" : "normal");
    } catch {
      /* niet opslaan is geen probleem */
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);

  return [large, toggle];
}

export function TextSizeToggle() {
  const t = useTranslations("dashboard");
  const [large, toggle] = useTextSize();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={large}
      title={t("textSize")}
      aria-label={t("textSize")}
      className="flex h-8 items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa] aria-pressed:border-brand-400/40 aria-pressed:bg-brand-500/15 aria-pressed:text-white"
    >
      <span aria-hidden className="text-xs font-semibold">A</span>
      <span aria-hidden className="text-base font-semibold">A</span>
    </button>
  );
}
