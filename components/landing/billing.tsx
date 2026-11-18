"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { monthlyAtYearly } from "@/lib/marketing";

export type BillingPeriod = "monthly" | "yearly";

interface BillingCtx {
  period: BillingPeriod;
  setPeriod: (p: BillingPeriod) => void;
}

const Ctx = createContext<BillingCtx | null>(null);

/** Deelt de gekozen betaalperiode met alle pricing-kaarten eronder. */
export function BillingProvider({ children }: { children: React.ReactNode }) {
  const period: BillingPeriod = "monthly";
  const setPeriod = () => {};
  return <Ctx.Provider value={{ period, setPeriod }}>{children}</Ctx.Provider>;
}

export function useBilling(): BillingCtx {
  const ctx = useContext(Ctx);
  // Fallback zodat een kaart ook buiten een provider blijft werken (maandprijs).
  return ctx ?? { period: "monthly", setPeriod: () => {} };
}

/** Effectieve maandprijs voor de huidige periode. */
export function usePeriodPrice(monthly: number): number {
  const { period } = useBilling();
  return period === "yearly" ? monthlyAtYearly(monthly) : monthly;
}

/**
 * Vloeiend tweenend getal: animeert van de vorige naar de nieuwe waarde
 * (bijv. €29 → €25 als je naar jaarbetaling schakelt). Respecteert
 * prefers-reduced-motion.
 */
export function useTween(value: number, duration = 450): number {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduced || from === value) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    let start = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / duration, 1);
      setShown(from + (value - from) * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return shown;
}

/** Prijs als "€29" met vloeiende overgang bij het schakelen. */
export function TweenPrice({ monthly, className }: { monthly: number; className?: string }) {
  const target = usePeriodPrice(monthly);
  const shown = useTween(target);
  return <span className={cn("tabular", className)}>€{Math.round(shown)}</span>;
}

/**
 * De schakelaar Maandelijks ↔ Jaarlijks, met een glijdende pil en een
 * subtiel pulserende "bespaar"-badge bij de jaarlijkse optie.
 */
export function BillingToggle() {
  const t = useTranslations("pricing.billing");
  return <p className="text-center text-sm text-slate-400">{t("monthlyNote")}</p>;
}
