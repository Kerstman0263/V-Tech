"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/utils";

export type CountFormat = "money" | "hours" | "km" | "number";

function render(value: number, format: CountFormat, locale: string, currency: string) {
  switch (format) {
    case "money":
      return formatMoney(value, locale, currency);
    case "hours":
      return `${value.toFixed(1)} u`;
    case "km":
      return `${Math.round(value).toLocaleString(locale === "nl" ? "nl-NL" : "en-US")} km`;
    default:
      return Math.round(value).toLocaleString(locale === "nl" ? "nl-NL" : "en-US");
  }
}

/**
 * Cijfer dat bij het in beeld komen vloeiend naar zijn eindwaarde telt.
 * Geeft het dashboard een "live" gevoel zonder externe animatiebibliotheek.
 */
export function CountUp({
  value,
  format = "number",
  locale = "nl",
  currency = "EUR",
  duration = 1100,
  className,
}: {
  value: number;
  format?: CountFormat;
  locale?: string;
  currency?: string;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value === 0) {
      setShown(value);
      return;
    }

    let raf = 0;
    let start = 0;
    // easeOutExpo — snel op gang, zacht uitrollend.
    const ease = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / duration, 1);
      setShown(value * ease(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };

    // Pas tellen zodra de tegel echt zichtbaar is.
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          raf = requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    if (el) observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {render(shown, format, locale, currency)}
    </span>
  );
}
