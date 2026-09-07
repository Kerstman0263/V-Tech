"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { PAGE_TOURS } from "@/components/onboarding/page-tour-steps";

/**
 * Per-pagina walkthroughs: de eerste keer dat een gebruiker een pagina opent,
 * krijgt die een korte spotlight-rondleiding langs de belangrijkste elementen
 * (data-tour ankers). Afgeronde tours staan in User.completedTours; "all" is
 * de sentinel voor "alle rondleidingen uit".
 *
 * Robuustheid (uit de adversariële review):
 * - De tour start pas zodra minstens één anker echt in de DOM staat (pagina's
 *   laden data client-side); ankers die er dan nog niet zijn — bijv. rol-
 *   afhankelijke blokken zoals billing voor niet-eigenaren — worden
 *   overgeslagen, mét behoud van de juiste tekst per stap.
 * - Een lopende her-meting vangt elementen die later verschijnen/verschuiven.
 * - Escape sluit alleen deze sessie (geen permanente afronding); afronden of
 *   overslaan gebeurt bewust via de knoppen.
 * - Toetsenbord blijft in de kaart (Tab-trap) en typt nooit per ongeluk in
 *   gedimde velden; pijltjestoetsen worden genegeerd in invoervelden.
 */

interface Rect {
  /** Hoekronding (px) van het doelwit, zodat het spotlight-kader concentrisch meeloopt. */
  radius: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Stap met het ORIGINELE stapnummer — de i18n-teksten (s1..sN) blijven
 *  kloppen, ook als eerdere stappen zijn weggefilterd. */
interface TourStep {
  anchor: string;
  n: number;
}

const PAD = 8;
const TIP_W = 320;
const GAP = 14;
const MARGIN = 12;
const TIP_H_FALLBACK = 220;
const SHOW_DELAY_MS = 700; // pagina even laten renderen/animeren
const DISCOVER_INTERVAL_MS = 250; // hoe vaak we op ankers wachten
const DISCOVER_TIMEOUT_MS = 6000; // geen enkel anker? Dan deze keer geen tour
const REMEASURE_MS = 500; // vangnet voor late DOM-wijzigingen

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function anchorEl(anchor: string): Element | null {
  return document.querySelector(`[data-tour="${anchor}"]`);
}

function measure(anchor: string): Rect | null {
  const el = anchorEl(anchor);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 };
}

function same(a: Rect | null, b: Rect | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/** Is dit toetsenbord-event afkomstig uit een invoerveld? */
function fromInput(e: KeyboardEvent): boolean {
  const t = e.target;
  return (
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
  );
}

interface TipPlacement {
  style: React.CSSProperties;
  /** Waar de kaart t.o.v. het doelwit staat — bepaalt de pijlrichting. */
  placement: "below" | "above" | "clamped";
  /** Horizontale positie van de pijl binnen de kaart (px vanaf links). */
  arrowLeft: number;
}

/** Tooltip onder het element; past hij niet, dan erboven; anders klemmen.
 *  Geeft ook de pijl-positie terug: de pijl wijst naar het midden van het
 *  uitgelichte element, zodat glashelder is waar de uitleg over gaat. */
function placeTip(rect: Rect, tipH: number): TipPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top: number;
  let placement: TipPlacement["placement"];
  const spaceBelow = vh - (rect.top + rect.height) - GAP - MARGIN;
  const spaceAbove = rect.top - GAP - MARGIN;

  if (spaceBelow >= tipH) {
    top = rect.top + rect.height + GAP;
    placement = "below";
  } else if (spaceAbove >= tipH) {
    top = rect.top - tipH - GAP;
    placement = "above";
  } else {
    top = clamp(rect.top, MARGIN, Math.max(MARGIN, vh - tipH - MARGIN));
    placement = "clamped";
  }

  const left = clamp(rect.left, MARGIN, vw - TIP_W - MARGIN);
  const arrowLeft = clamp(rect.left + rect.width / 2 - left - 6, 18, TIP_W - 30);
  return { style: { top, left, width: TIP_W }, placement, arrowLeft };
}

function PageTourOverlay({
  page,
  anchors,
  onDone,
  onClose,
}: {
  page: string;
  anchors: string[];
  /** Permanent afronden/overslaan (knoppen). skipAll = "all"-sentinel. */
  onDone: (skipAll: boolean) => void;
  /** Alleen deze sessie sluiten (Escape / geen ankers gevonden). */
  onClose: () => void;
}) {
  const t = useTranslations("pageTours");
  const tc = useTranslations("tour");

  // null = nog aan het wachten tot de pagina zijn ankers heeft gerenderd.
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [tipH, setTipH] = useState(TIP_H_FALLBACK);
  const cardRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<Rect | null>(null);

  // Ankers ontdekken: pagina's halen data client-side op, dus wachten tot er
  // minstens één anker echt bestaat en dan pas filteren welke stappen deze
  // gebruiker krijgt (rol-afhankelijke blokken renderen soms nooit).
  useEffect(() => {
    let waited = 0;
    const tick = () => {
      const present = anchors.map((anchor, i) => ({ anchor, n: i + 1 })).filter((s) => anchorEl(s.anchor));
      if (present.length > 0) {
        clearInterval(id);
        setSteps(present);
        return;
      }
      waited += DISCOVER_INTERVAL_MS;
      if (waited >= DISCOVER_TIMEOUT_MS) {
        clearInterval(id);
        onClose(); // niets gevonden: deze keer geen tour, volgende bezoek opnieuw
      }
    };
    const id = setInterval(tick, DISCOVER_INTERVAL_MS);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = steps?.[index] ?? null;
  const isLast = steps ? index === steps.length - 1 : false;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Positie volgen: max één meting per frame (ticking) bij scroll/resize, en
  // een langzaam vangnet-interval voor DOM-wijzigingen zonder events (data
  // die binnenkomt, panelen die uitklappen).
  useEffect(() => {
    if (!step) return;
    let rafId = 0;
    let ticking = false;

    const update = () => {
      const next = measure(step.anchor);
      if (!same(rectRef.current, next)) {
        rectRef.current = next;
        setRect(next);
      }
    };

    const schedule = () => {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    };

    update();
    const settle = setTimeout(update, 350);
    const safety = setInterval(update, REMEASURE_MS);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settle);
      clearInterval(safety);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [step]);

  // Werkelijke kaarthoogte meten voor de flip-berekening.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - tipH) > 1) setTipH(h);
  }, [index, isDesktop, rect, tipH, steps]);

  // Doelwit in beeld scrollen (zonder animatie bij "minder beweging").
  useEffect(() => {
    if (!step) return;
    const el = anchorEl(step.anchor);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && (r.top < 0 || r.bottom > window.innerHeight)) {
      el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    }
  }, [step]);

  const next = useCallback(() => {
    if (isLast) onDone(false);
    else setIndex((i) => i + 1);
  }, [isLast, onDone]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose(); // alleen deze sessie — afronden gaat via de knoppen
        return;
      }
      if (fromInput(e)) return;
      if (e.key === "Tab") {
        // Echte focus-trap: Tab cyclet door de knoppen van de kaart
        // (Shift+Tab terug) in plaats van naar de gedimde pagina te lekken.
        e.preventDefault();
        const els = cardRef.current ? Array.from(cardRef.current.querySelectorAll<HTMLElement>("button")) : [];
        if (els.length > 0) {
          const i = els.indexOf(document.activeElement as HTMLElement);
          const target = e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i + 1) % els.length;
          els[target]?.focus();
        }
      }
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, next, prev, onClose]);

  if (!steps || !step) return null;

  const placed = isDesktop && rect ? placeTip(rect, tipH) : null;

  return createPortal(
    <div data-tour-active="" className="pointer-events-auto fixed inset-0 z-[100]" onClick={(e) => e.stopPropagation()}>
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-auto absolute cursor-not-allowed ring-2 ring-brand-400/80 transition-all duration-300 ease-out"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            // Concentrische hoeken: buitenradius = radius doelwit + PAD. Anders zie je een
            // dubbele rand in de hoeken (kader 16px vs. kaart 24px).
            borderRadius: Math.max(12, rect.radius + PAD),
            boxShadow: "0 0 0 9999px rgba(4, 3, 12, 0.72), 0 0 30px rgb(var(--brand-600) / 0.45)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[#04030c]/72" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-tour-title"
        style={placed?.style}
        className={cn(
          "pointer-events-auto z-[101] animate-rise rounded-2xl border border-white/10 bg-[#12112a]/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-md",
          placed ? "fixed" : "fixed bottom-4 left-4 right-4",
        )}
      >
        {/* Pijl naar het uitgelichte element — maakt de koppeling glashelder */}
        {placed && placed.placement !== "clamped" && (
          <span
            aria-hidden
            className={cn(
              "absolute h-3 w-3 rotate-45 bg-[#12112a]",
              placed.placement === "below" ? "-top-[7px] border-l border-t border-white/10" : "-bottom-[7px] border-b border-r border-white/10",
            )}
            style={{ left: placed.arrowLeft }}
          />
        )}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-300">
          {tc("stepOf", { current: index + 1, total: steps.length })}
        </p>
        <h2 id="page-tour-title" className="mt-1 text-base font-bold text-white">
          {t(`${page}.s${step.n}.title`)}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(`${page}.s${step.n}.body`)}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.anchor}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-6 bg-brand-500" : i < index ? "w-1.5 bg-brand-500/50" : "w-1.5 bg-white/10",
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex flex-col items-start">
            <button
              type="button"
              onClick={() => onDone(false)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              {tc("skip")}
            </button>
            <button
              type="button"
              onClick={() => onDone(true)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 underline decoration-slate-600 underline-offset-2 transition-colors hover:text-slate-200"
            >
              {tc("skipAll")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10"
              >
                {tc("prev")}
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={next}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md"
            >
              {isLast ? tc("finish") : tc("next")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PageTours({ completed }: { completed: string[] }) {
  const pathname = usePathname();
  const [done, setDone] = useState<Set<string>>(() => new Set(completed));
  // Alleen-deze-sessie gesloten (Escape / ankers niet gevonden) — geen persist.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  // De tour mag pas verschijnen als de delay voor DEZE route is verstreken.
  // Render-time vergelijking (readyFor === pathname) voorkomt de één-frame-
  // flits die een effect-gebaseerde reset zou geven bij navigatie.
  const [readyFor, setReadyFor] = useState<string | null>(null);

  // Server-status kan verversen (router.refresh) — samenvoegen, nooit kwijtraken.
  useEffect(() => {
    setDone((prev) => new Set([...prev, ...completed]));
  }, [completed]);

  useEffect(() => {
    const id = setTimeout(() => setReadyFor(pathname), SHOW_DELAY_MS);
    return () => clearTimeout(id);
  }, [pathname]);

  const entry = Object.entries(PAGE_TOURS).find(([, def]) => def.route === pathname);
  const pageKey = entry?.[0];
  const def = entry?.[1];

  const complete = useCallback((key: string, skipAll: boolean) => {
    const value = skipAll ? "all" : key;
    setDone((prev) => new Set([...prev, value]));
    // Fire-and-forget: bij een netwerkfout verschijnt de tour hooguit nog
    // eens bij het volgende bezoek — nooit een blokkade voor de gebruiker.
    void fetch("/api/user/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tour: value }),
    }).catch(() => {});
  }, []);

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => new Set([...prev, key]));
  }, []);

  if (
    readyFor !== pathname ||
    !pageKey ||
    !def ||
    done.has("all") ||
    done.has(pageKey) ||
    dismissed.has(pageKey)
  ) {
    return null;
  }

  return (
    <PageTourOverlay
      key={pageKey}
      page={pageKey}
      anchors={def.anchors}
      onDone={(skipAll) => complete(pageKey, skipAll)}
      onClose={() => dismiss(pageKey)}
    />
  );
}
