"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CountUp, type CountFormat } from "@/components/ui/CountUp";

type Tone = "brand" | "green" | "amber" | "teal" | "rose";

const tones: Record<Tone, { bar: string; glow: string; iconBg: string; iconText: string; stroke: string; sub: string }> = {
  brand: {
    bar: "from-brand-500 to-fuchsia-400",
    glow: "bg-brand-500/30",
    iconBg: "bg-brand-500/10",
    iconText: "text-brand-300",
    stroke: "#a78bfa",
    sub: "text-brand-300",
  },
  green: {
    bar: "from-emerald-500 to-teal-500",
    glow: "bg-emerald-500/30",
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-400",
    stroke: "#34d399",
    sub: "text-emerald-400",
  },
  amber: {
    bar: "from-amber-500 to-orange-500",
    glow: "bg-amber-500/30",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-400",
    stroke: "#fbbf24",
    sub: "text-amber-400",
  },
  teal: {
    bar: "from-teal-500 to-cyan-500",
    glow: "bg-teal-500/30",
    iconBg: "bg-teal-500/10",
    iconText: "text-teal-400",
    stroke: "#2dd4bf",
    sub: "text-teal-400",
  },
  rose: {
    bar: "from-rose-500 to-pink-500",
    glow: "bg-rose-500/30",
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-400",
    stroke: "#fb7185",
    sub: "text-rose-400",
  },
};

/** Mini-trendlijn (sparkline) op basis van een reeks getallen. */
function Spark({ series, stroke, id }: { series: number[]; stroke: string; id: string }) {
  if (series.length < 2) return null;
  const w = 120;
  const h = 34;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = max - min || 1;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });

  // Vloeiende curve door de punten (Catmull-Rom → Bézier).
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-9 w-full overflow-visible">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w},${h} L 0,${h} Z`} fill={`url(#spark-${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} className="animate-beacon origin-center" />
    </svg>
  );
}

/**
 * Premium KPI-tegel: tellend cijfer, trendlijn, verschil t.o.v. vorige maand
 * en een spotlight die de muis volgt.
 */
export function KpiCard({
  label,
  value,
  format = "number",
  locale = "nl",
  icon,
  tone = "brand",
  sub,
  href,
  delta,
  series = [],
  index = 0,
}: {
  label: string;
  value: number;
  format?: CountFormat;
  locale?: string;
  icon: IconName;
  tone?: Tone;
  sub?: string;
  href?: string;
  /** Procentueel verschil t.o.v. de vorige periode; null = geen vergelijking. */
  delta?: number | null;
  /** Reeks voor de mini-trendlijn. */
  series?: number[];
  /** Volgnummer voor de gefaseerde entree-animatie. */
  index?: number;
}) {
  const c = tones[tone];
  const ref = useRef<HTMLDivElement>(null);

  // Spotlight volgt de cursor via CSS-variabelen (zie .spotlight in globals.css).
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const up = (delta ?? 0) >= 0;

  const body = (
    <div
      ref={ref}
      onMouseMove={onMove}
      style={{ "--i": index } as React.CSSProperties}
      className={cn(
        "spotlight group relative flex h-full animate-rise flex-col overflow-hidden rounded-2xl",
        "border border-white/[0.05] bg-[#12112a]/60 p-5 backdrop-blur-md",
        "transition-all duration-300 hover:-translate-y-1 hover:border-white/10 hover:shadow-glow-md",
      )}
    >
      {/* Accentrand boven + gloed rechtsboven */}
      <div className={cn("absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r", c.bar)} />
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100",
          c.glow,
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-400">{label}</p>
          <p className="tabular mt-2 text-2xl font-extrabold tracking-tight text-white">
            <CountUp value={value} format={format} locale={locale} />
          </p>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/5", c.iconBg, c.iconText)}>
          <Icon name={icon} className="h-5 w-5" />
        </div>
      </div>

      {/* Trendlijn vult de onderkant van de tegel */}
      {series.length > 1 && (
        <div className="relative mt-3 -mx-1">
          <Spark series={series} stroke={c.stroke} id={`${tone}-${index}`} />
        </div>
      )}

      <div className="relative mt-2 flex items-center gap-2">
        {typeof delta === "number" && (
          <span
            className={cn(
              "tabular inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
              up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400",
            )}
          >
            <svg viewBox="0 0 24 24" className={cn("h-3 w-3", !up && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {sub && <p className={cn("truncate text-xs font-medium", typeof delta === "number" ? "text-slate-500" : c.sub)}>{sub}</p>}
      </div>

      {href && (
        <span className="pointer-events-none absolute bottom-4 right-4 text-slate-600 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-slate-300 group-hover:opacity-100">
          →
        </span>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
