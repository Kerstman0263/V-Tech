"use client";

import { useEffect, useState } from "react";

/**
 * Live klok + datum in de welkomstbanner. Rendert pas na mount (voorkomt een
 * hydration-mismatch tussen servertijd en browsertijd).
 */
export function LiveClock({ locale }: { locale: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="h-[38px]" aria-hidden />;

  const tag = locale === "nl" ? "nl-NL" : "en-US";
  const date = new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long" }).format(now);
  const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit" }).format(now);

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-beacon rounded-full bg-emerald-400" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <div className="leading-tight">
        <p className="tabular text-sm font-semibold text-white">{time}</p>
        <p className="text-[11px] capitalize text-slate-400">{date}</p>
      </div>
    </div>
  );
}
