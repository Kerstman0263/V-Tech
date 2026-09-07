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
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
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
  const { period, setPeriod } = useBilling();
  const yearly = period === "yearly";

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="tablist"
        aria-label={t("aria")}
        className="relative inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur"
      >
        {/* Glijdende actieve pil */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-brand-600 shadow-glow-md transition-transform duration-300 ease-out",
            yearly ? "translate-x-[calc(100%+0px)]" : "translate-x-0",
          )}
        />
        <button
          role="tab"
          aria-selected={!yearly}
          onClick={() => setPeriod("monthly")}
          className={cn(
            "relative z-10 rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-200",
            !yearly ? "text-white" : "text-slate-400 hover:text-white",
          )}
        >
          {t("monthly")}
        </button>
        <button
          role="tab"
          aria-selected={yearly}
          onClick={() => setPeriod("yearly")}
          className={cn(
            "relative z-10 rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-200",
            yearly ? "text-white" : "text-slate-400 hover:text-white",
          )}
        >
          {t("yearly")}
        </button>
      </div>

      {/* Pulserende bespaar-badge */}
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 transition-all duration-300",
          yearly ? "animate-fade-pulse opacity-100" : "opacity-60",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {t("saveBadge")}
      </span>
    </div>
  );
}
