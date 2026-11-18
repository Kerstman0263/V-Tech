"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { URENCRITERIUM_HOURS, WORK_WEEKS_PER_YEAR } from "@/lib/marketing";

/** Vloeiend meelopend getal (respecteert "minder beweging"). */
function useTween(value: number, duration = 450): number {
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
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
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

/** Gestileerde bereik-slider met waarde-bubbel. */
function Slider({
  label,
  hint,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <span className="tabular rounded-lg border border-rand bg-grond px-2.5 py-1 text-sm font-bold text-white">
          {value} {suffix}
        </span>
      </div>
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 my-auto h-1.5 w-full rounded-full bg-white/10" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 my-auto h-1.5 rounded-full bg-brand-500"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className={cn(
            "relative w-full cursor-pointer appearance-none rounded-full bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-saldova-licht",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-500",
          )}
        />
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * Urencriterium-check (1225-uursgrens). Laat een zzp'er zien of hij op koers
 * ligt voor de zelfstandigenaftrek — inclusief de indirecte uren die vaak
 * worden vergeten. Geen "besparings"-claim, maar een concrete, eerlijke check.
 */
export function UrencriteriumCheck() {
  const t = useTranslations("uren");
  const [direct, setDirect] = useState(20);
  const [indirect, setIndirect] = useState(6);

  const perWeek = direct + indirect;
  const perYear = perWeek * WORK_WEEKS_PER_YEAR;
  const indirectYear = indirect * WORK_WEEKS_PER_YEAR;
  const meets = perYear >= URENCRITERIUM_HOURS;
  const pct = Math.min(100, (perYear / URENCRITERIUM_HOURS) * 100);
  const remaining = Math.max(0, URENCRITERIUM_HOURS - perYear);

  const shownYear = useTween(perYear, 500);
  const shownPct = useTween(pct, 600);

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2">
      {/* Sliders */}
      <div className="card-glass flex flex-col justify-center gap-7 p-5 sm:p-7">
        <Slider label={t("direct")} hint={t("directHint")} value={direct} min={0} max={40} suffix={t("perWeek")} onChange={setDirect} />
        <Slider label={t("indirect")} hint={t("indirectHint")} value={indirect} min={0} max={20} suffix={t("perWeek")} onChange={setIndirect} />
        <p className="text-xs text-slate-400">{t("weeksNote", { weeks: WORK_WEEKS_PER_YEAR })}</p>
      </div>

      {/* Resultaat */}
      <div className="relative overflow-hidden rounded-2xl border border-saldova-licht/30 bg-kaart p-5 sm:p-7">

        <div className="relative flex h-full flex-col justify-center">
          <p className="text-sm font-medium text-slate-300">{t("resultLead")}</p>
          <p className="tabular mt-2 text-5xl font-extrabold tracking-tight text-white">
            {Math.round(shownYear)} <span className="text-2xl font-bold text-saldova-licht">{t("hoursPerYear")}</span>
          </p>

          {/* Voortgang naar 1225 */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-300">
              <span>{t("target", { target: URENCRITERIUM_HOURS })}</span>
              <span className="tabular font-semibold">{Math.round(shownPct)}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={cn("h-full rounded-full transition-[width] duration-500", meets ? "bg-emerald-500" : "bg-brand-500")}
                style={{ width: `${shownPct}%` }}
              />
            </div>
          </div>

          {/* Boodschap */}
          <div className={cn("mt-5 rounded-xl border p-3 text-sm", meets ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200")}>
            {meets ? t("met") : t("notMet", { remaining })}
          </div>

          <p className="mt-4 text-xs text-slate-300">{t("indirectCallout", { hours: indirectYear })}</p>
        </div>
      </div>
    </div>
  );
}
