"use client";

import { useMemo, useState } from "react";
import { cn, formatMoney } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface RevenuePoint {
  label: string;
  /** Betaalde omzet in deze maand. */
  value: number;
  /** Gefactureerd (verzonden/betaald/verlopen) in deze maand. */
  invoiced?: number;
}

const W = 600; // interne tekenbreedte (viewBox)
const H = 190; // interne tekenhoogte

/** Vloeiende curve door een reeks punten (Catmull-Rom → Bézier). */
function smoothPath(pts: readonly (readonly [number, number])[]) {
  if (pts.length === 0) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Ronde bovengrens voor de y-as (bijv. 4.317 → 5.000). */
function niceMax(v: number) {
  if (v <= 0) return 1000;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / (mag / 2)) * (mag / 2);
}

/**
 * Interactieve omzetgrafiek: gradient-vlak voor betaalde omzet, gestippelde
 * lijn voor gefactureerd, gemiddeldelijn, hover-crosshair met tooltip.
 * Volledig SVG/CSS — geen externe grafiekbibliotheek.
 */
export function RevenueChart({
  data,
  locale,
  currency = "EUR",
  emptyLabel,
  labels,
}: {
  data: RevenuePoint[];
  locale: string;
  currency?: string;
  emptyLabel?: string;
  labels: { paid: string; invoiced: string; average: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const hasData = data.some((d) => d.value > 0 || (d.invoiced ?? 0) > 0);

  const geo = useMemo(() => {
    const max = niceMax(Math.max(...data.map((d) => Math.max(d.value, d.invoiced ?? 0)), 0));
    const x = (i: number) => (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W);
    const y = (v: number) => H - (v / max) * (H - 12) - 6;
    const paid = data.map((d, i) => [x(i), y(d.value)] as const);
    const inv = data.map((d, i) => [x(i), y(d.invoiced ?? 0)] as const);
    const avg = data.reduce((s, d) => s + d.value, 0) / (data.length || 1);
    return { max, x, y, paid, inv, avg, avgY: y(avg) };
  }, [data]);

  // Lege staat: sfeervolle placeholder met een vage spookgrafiek.
  if (!hasData) {
    const ghost = [42, 68, 55, 82, 61, 90];
    return (
      <div className="relative flex h-56 flex-col overflow-hidden rounded-xl border border-dashed border-white/[0.06] bg-white/[0.02]">
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-end gap-2 p-5 opacity-[0.06] blur-[1px] sm:gap-4">
          {ghost.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-lg bg-gradient-to-t from-brand-500 to-brand-300" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
            <Icon name="chart" className="h-5 w-5" />
          </span>
          <p className="max-w-xs text-sm text-slate-400">{emptyLabel ?? "—"}</p>
        </div>
      </div>
    );
  }

  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      {/* Legenda */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-400 shadow-glow" />
          {labels.paid}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-3 border-t border-dashed border-slate-500" />
          {labels.invoiced}
        </span>
        <span className="ml-auto tabular text-slate-500">
          {labels.average}: <span className="font-medium text-slate-300">{formatMoney(geo.avg, locale, currency)}</span>
        </span>
      </div>

      <div className="flex gap-2">
        {/* Y-as */}
        <div className="tabular flex w-14 shrink-0 flex-col justify-between py-[2px] text-right text-[10px] text-slate-600">
          {[1, 0.66, 0.33, 0].map((f) => (
            <span key={f}>
              {new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(geo.max * f)}
            </span>
          ))}
        </div>

        {/* Tekenvlak */}
        <div
          className="relative h-48 flex-1"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - r.left) / r.width;
            setHover(Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))));
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
                <stop offset="55%" stopColor="#8b5cf6" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="rev-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="50%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#e879f9" />
              </linearGradient>
            </defs>

            {/* Raster */}
            {[0, 0.33, 0.66, 1].map((f) => (
              <line key={f} x1="0" x2={W} y1={6 + f * (H - 12)} y2={6 + f * (H - 12)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}

            {/* Gemiddeldelijn */}
            <line x1="0" x2={W} y1={geo.avgY} y2={geo.avgY} stroke="rgba(226,232,240,0.25)" strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />

            {/* Gefactureerd (gestippeld) */}
            <path d={smoothPath(geo.inv)} fill="none" stroke="rgba(148,163,184,0.55)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />

            {/* Betaalde omzet — vlak + lijn, tekent zichzelf bij het laden */}
            <path d={`${smoothPath(geo.paid)} L ${W},${H} L 0,${H} Z`} fill="url(#rev-fill)" className="animate-rise" />
            <path
              d={smoothPath(geo.paid)}
              fill="none"
              stroke="url(#rev-line)"
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pathLength={100}
              strokeDasharray={100}
              style={{ animation: "s-draw 1.4s cubic-bezier(0.22,1,0.36,1) both" }}
            />

            {/* Hover-crosshair */}
            {hover !== null && (
              <line x1={geo.paid[hover][0]} x2={geo.paid[hover][0]} y1="0" y2={H} stroke="rgba(167,139,250,0.4)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {/* Punten + tooltip als HTML (scherpe tekst, geen viewBox-vervorming) */}
          {data.map((d, i) => (
            <span
              key={d.label}
              className={cn(
                "pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#12112a] bg-brand-300 transition-all duration-200",
                hover === i ? "scale-125 opacity-100 shadow-glow-md" : "scale-75 opacity-0",
              )}
              style={{ left: `${(geo.paid[i][0] / W) * 100}%`, top: `${(geo.paid[i][1] / H) * 100}%` }}
            />
          ))}

          {active && hover !== null && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-xl border border-white/10 bg-[#12112a]/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur-md"
              style={{
                left: `${Math.min(88, Math.max(12, (geo.paid[hover][0] / W) * 100))}%`,
                top: `${(geo.paid[hover][1] / H) * 100}%`,
              }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{active.label}</p>
              <p className="tabular mt-0.5 text-sm font-bold text-white">{formatMoney(active.value, locale, currency)}</p>
              {typeof active.invoiced === "number" && active.invoiced > 0 && (
                <p className="tabular mt-0.5 text-[11px] text-slate-400">
                  {labels.invoiced}: {formatMoney(active.invoiced, locale, currency)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* X-as */}
      <div className="mt-2 flex gap-2">
        <div className="w-14 shrink-0" />
        <div className="flex flex-1 justify-between text-xs font-medium">
          {data.map((d, i) => (
            <span key={d.label} className={cn("transition-colors", hover === i ? "text-brand-300" : "text-slate-500")}>
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
