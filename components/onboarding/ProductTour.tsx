"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { TOURS, type TourVariant } from "@/components/onboarding/tour-steps";

interface Rect {
  /** Hoekronding (px) van het doelwit, zodat het spotlight-kader concentrisch meeloopt. */
  radius: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8; // ruimte tussen de uitlichting en het element
const TIP_W = 320; // breedte van de tooltip op desktop
const GAP = 14; // afstand tussen element en tooltip
const MARGIN = 12; // minimale afstand tot de schermrand
const TIP_H_FALLBACK = 220; // hoogte-schatting vóór de eerste meting

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Is dit toetsenbord-event afkomstig uit een invoerveld? */
function fromInput(e: KeyboardEvent): boolean {
  const t = e.target;
  return (
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
  );
}

/** Meet een element; geeft null als het niet bestaat of onzichtbaar is
 *  (op mobiel is de desktop-zijbalk `display:none` -> rect is dan 0x0). */
function measure(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 };
}

/** Twee rects vergelijken — voorkomt een re-render bij identieke metingen. */
function same(a: Rect | null, b: Rect | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

interface TipPlacement {
  style: React.CSSProperties;
  /** Waar de kaart t.o.v. het doelwit staat — bepaalt de pijlrichting. */
  placement: "right" | "left" | "below" | "above" | "clamped";
  /** Pijl-positie binnen de kaart (px), afhankelijk van de richting. */
  arrowLeft?: number;
  arrowTop?: number;
}

/**
 * Plaatst de tooltip naast het element, met flip-logica.
 *
 * side "right": past hij rechts niet, dan klapt hij naar LINKS van het element.
 * side "bottom": past hij onder niet, dan klapt hij naar BOVEN het element.
 * Pas als het aan beide kanten niet past, wordt hij binnen het scherm geklemd —
 * nooit stilletjes bovenop het uitgelichte element geschoven.
 * Geeft ook de pijl-positie terug: de pijl wijst naar het uitgelichte element.
 */
function placeTip(rect: Rect, side: "right" | "bottom", tipH: number): TipPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left: number;
  let top: number;

  if (side === "right") {
    const spaceRight = vw - (rect.left + rect.width) - GAP - MARGIN;
    const spaceLeft = rect.left - GAP - MARGIN;
    let placement: TipPlacement["placement"];

    if (spaceRight >= TIP_W) {
      left = rect.left + rect.width + GAP; // voorkeur: rechts
      placement = "right";
    } else if (spaceLeft >= TIP_W) {
      left = rect.left - TIP_W - GAP; // flip: links
      placement = "left";
    } else {
      left = clamp(rect.left, MARGIN, vw - TIP_W - MARGIN); // nergens ruimte: klemmen
      placement = "clamped";
    }

    // Verticaal uitlijnen op de bovenkant van het element, binnen het scherm.
    top = clamp(rect.top - 8, MARGIN, Math.max(MARGIN, vh - tipH - MARGIN));
    const arrowTop = clamp(rect.top + rect.height / 2 - top - 6, 18, tipH - 30);
    return { style: { top, left, width: TIP_W }, placement, arrowTop };
  }

  const spaceBelow = vh - (rect.top + rect.height) - GAP - MARGIN;
  const spaceAbove = rect.top - GAP - MARGIN;
  let placement: TipPlacement["placement"];

  if (spaceBelow >= tipH) {
    top = rect.top + rect.height + GAP; // voorkeur: onder
    placement = "below";
  } else if (spaceAbove >= tipH) {
    top = rect.top - tipH - GAP; // flip: boven
    placement = "above";
  } else {
    top = clamp(rect.top, MARGIN, Math.max(MARGIN, vh - tipH - MARGIN));
    placement = "clamped";
  }

  left = clamp(rect.left, MARGIN, vw - TIP_W - MARGIN);
  const arrowLeft = clamp(rect.left + rect.width / 2 - left - 6, 18, TIP_W - 30);
  return { style: { top, left, width: TIP_W }, placement, arrowLeft };
}

/**
 * Interactieve productrondleiding.
 *
 * - Rendert via een portal op <body> (buiten elke blur-/stacking-context).
 * - Spotlight = één kader met een enorme box-shadow: alles eromheen wordt
 *   gedimd, zonder SVG-masks of extra libraries.
 * - De overlay vangt ALLE kliks: tijdens de tour is alleen de kaart bedienbaar.
 * - Desktop: tooltip naast/onder het element, met flip als de ruimte op is.
 * - Mobiel (< md): tooltip wordt een gecentreerde overlay onderaan het scherm.
 */
export function ProductTour({ variant }: { variant: TourVariant }) {
  const t = useTranslations("tour");
  const router = useRouter();
  const pathname = usePathname();

  const steps = TOURS[variant];
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [tipH, setTipH] = useState(TIP_H_FALLBACK);

  const cardRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<Rect | null>(null); // spiegel van `rect` voor de rAF-loop

  const step = steps[index];
  // De ankers (#tour-welcome) staan op de dashboardpagina; elders geen tour.
  const onDashboard = pathname === "/dashboard";
  const active = mounted && !closed && onDashboard && Boolean(step);

  useEffect(() => setMounted(true), []);

  // Breekpunt volgen (md = 768px) — bepaalt tooltip- vs bottom-sheet-modus.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Positie van het doelwit bijhouden bij stapwissel, scrollen en resizen.
  //
  // PERFORMANCE: scroll vuurt tot honderden keren per seconde (nog vaker op een
  // 120Hz-scherm). Direct meten zou per event een geforceerde reflow triggeren
  // (layout thrashing). Daarom het ticking-principe: per frame hoogstens één
  // meting, en we zetten de state alleen als de rect ook echt is veranderd.
  useEffect(() => {
    if (!active || !step) return;

    let rafId = 0;
    let ticking = false;

    const update = () => {
      const next = measure(step.target);
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

    // Direct meten, plus een late meting: bij de eerste stap kan de kaart nog
    // aan het in-animeren zijn (animate-rise). Het vangnet-interval vindt ook
    // ankers die pas verschijnen nadat de pagina zijn data heeft geladen —
    // zonder scroll- of resize-event zou de spotlight anders nooit koppelen.
    update();
    const settle = setTimeout(update, 350);
    const safety = setInterval(update, 500);

    // passive: we roepen nooit preventDefault aan -> browser hoeft niet te wachten.
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settle);
      clearInterval(safety);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [active, step, index]);

  // Werkelijke hoogte van de kaart meten -> de flip-logica rekent met de echte
  // hoogte in plaats van een schatting.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - tipH) > 1) setTipH(h);
  }, [index, isDesktop, rect, tipH]);

  // Doelwit in beeld scrollen als het buiten de viewport valt.
  useEffect(() => {
    if (!active || !step) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && (r.top < 0 || r.bottom > window.innerHeight)) {
      el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    }
  }, [active, step, index]);

  /** Status permanent vastleggen en de tour sluiten. */
  const finish = useCallback(async () => {
    setClosed(true);
    try {
      await fetch("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
    } catch {
      // Netwerkfout: de tour is voor deze sessie weg; bij de volgende
      // pagina-load probeert hij het simpelweg opnieuw. Geen blokkade.
    }
    // Server components opnieuw ophalen -> de layout rendert de tour niet meer.
    router.refresh();
  }, [router]);

  const next = useCallback(() => {
    if (index >= steps.length - 1) void finish();
    else setIndex((i) => i + 1);
  }, [index, steps.length, finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Toetsenbordbediening. Escape sluit alleen deze sessie (geen permanente
  // afronding — dat gaat bewust via de knoppen); Tab blijft in de kaart en
  // pijltjestoetsen worden genegeerd zodra de focus in een invoerveld staat.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setClosed(true);
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
  }, [active, next, prev]);

  if (!active || !step) return null;

  const isLast = index === steps.length - 1;
  // Alleen op desktop mét zichtbaar doelwit zweeft de kaart; anders bottom-sheet.
  const placed = isDesktop && rect ? placeTip(rect, step.side, tipH) : null;

  return createPortal(
    // De overlay vangt alle kliks (pointer-events-auto). Zonder dit kan de
    // gebruiker dwars door de dimlaag heen op de zijbalk of dashboardknoppen
    // klikken — een box-shadow vangt namelijk zelf géén pointer-events.
    <div
      data-tour-active=""
      className="pointer-events-auto fixed inset-0 z-[100]"
      onClick={(e) => e.stopPropagation()}
    >
      {rect ? (
        // Spotlight: het kader zelf is transparant; de gigantische box-shadow
        // dimt alles eromheen. Eén element, geen mask, geen library.
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
        // Geen (zichtbaar) doelwit — bijv. de zijbalk is ingeklapt op mobiel.
        // Dan alleen dimmen; de uitleg staat in de bottom-sheet.
        <div aria-hidden className="absolute inset-0 bg-[#04030c]/72" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        style={placed?.style}
        className={cn(
          "pointer-events-auto z-[101] animate-rise rounded-2xl border border-white/10 bg-[#12112a]/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-md",
          // Mobiel (of geen doelwit): nette overlay onderaan het scherm.
          placed ? "fixed" : "fixed bottom-4 left-4 right-4",
        )}
      >
        {/* Pijl naar het uitgelichte element — maakt de koppeling glashelder */}
        {placed && placed.placement !== "clamped" && (
          <span
            aria-hidden
            className={cn(
              "absolute h-3 w-3 rotate-45 bg-[#12112a]",
              placed.placement === "right" && "-left-[7px] border-b border-l border-white/10",
              placed.placement === "left" && "-right-[7px] border-r border-t border-white/10",
              placed.placement === "below" && "-top-[7px] border-l border-t border-white/10",
              placed.placement === "above" && "-bottom-[7px] border-b border-r border-white/10",
            )}
            style={{ left: placed.arrowLeft, top: placed.arrowTop }}
          />
        )}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-300">
          {t("stepOf", { current: index + 1, total: steps.length })}
        </p>
        <h2 id="tour-title" className="mt-1 text-base font-bold text-white">
          {t(`steps.${step.key}.title`)}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(`steps.${step.key}.body`)}</p>

        {/* Voortgangsstippen */}
        <div className="mt-4 flex items-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-6 bg-brand-500" : i < index ? "w-1.5 bg-brand-500/50" : "w-1.5 bg-white/10",
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void finish()}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            {t("skip")}
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10"
              >
                {t("prev")}
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={next}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md"
            >
              {isLast ? t("finish") : t("next")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
