"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  brand: { from: "#7c3aed", to: "#e879f9", text: "text-brand-300" },
  green: { from: "#10b981", to: "#2dd4bf", text: "text-emerald-400" },
  amber: { from: "#f59e0b", to: "#fb923c", text: "text-amber-400" },
} as const;

/**
 * Ronde meter (0–100%) die bij het laden vloeiend naar zijn waarde loopt.
 * Gebruikt voor bijv. de incassoratio: welk deel van je facturen is binnen.
 */
export function RadialGauge({
  percent,
  label,
  sub,
  tone = "brand",
  size = 132,
}: {
  percent: number;
  label: string;
  sub?: string;
  tone?: keyof typeof TONES;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  const [shown, setShown] = useState(0);
  const c = TONES[tone];

  const r = (size - 14) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    // Kleine vertraging zodat de CSS-transitie de sprong echt animeert.
    const id = setTimeout(() => setShown(pct), 120);
    return () => clearTimeout(id);
  }, [pct]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={`gauge-${tone}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={c.from} />
              <stop offset="100%" stopColor={c.to} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#gauge-${tone})`}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (shown / 100) * circumference}
            style={{ transition: "stroke-dashoffset 1.3s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-extrabold tracking-tight text-white">{Math.round(shown)}%</span>
          {sub && <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{sub}</span>}
        </div>
      </div>
      <p className={cn("mt-3 text-center text-xs font-medium", c.text)}>{label}</p>
    </div>
  );
}
