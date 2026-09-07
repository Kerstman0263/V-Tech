"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { NavIcon } from "@/components/dashboard/SidebarContent";

/**
 * Command Palette (Ctrl+K / Cmd+K) — overal in de tool direct springen naar
 * een pagina of een actie starten (nieuwe factuur, offerte...). Puur client-
 * side: statische lijst gefilterd op dezelfde rechten als de zijbalk, dus er
 * lekt niets — de server dwingt rechten sowieso af op elke pagina.
 */

interface PaletteItem {
  key: string;
  icon: string;
  href: string;
  label: string;
  group: "nav" | "action";
}

export function CommandPalette({
  isZzp,
  canFinance,
  canTeam,
  isAdmin,
  hidden = [],
}: {
  isZzp: boolean;
  canFinance: boolean;
  canTeam: boolean;
  isAdmin: boolean;
  /** Door de gebruiker verborgen modules — blijven ook uit de zoekbalk. */
  hidden?: string[];
}) {
  const t = useTranslations("palette");
  const tn = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  // Portal kan pas na hydration (document.body); mac bepaalt het kbd-label.
  const [mounted, setMounted] = useState(false);
  const [mac, setMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
    setMac(/Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent));
  }, []);

  // Zolang een rondleiding actief is, blijft de palette dicht — anders opent
  // hij onzichtbaar ónder de tour-overlay en steelt het invoerveld de focus.
  const tourActive = () => typeof document !== "undefined" && !!document.querySelector("[data-tour-active]");

  // Zelfde zichtbaarheidsregels als de zijbalk.
  const items = useMemo<PaletteItem[]>(() => {
    const nav: [string, string, boolean][] = [
      ["dashboard", "/dashboard", true],
      ["time", "/time", true],
      ["mileage", "/mileage", true],
      ["tasks", "/tasks", true],
      ["fiscaleRust", "/fiscale-rust", true],
      ["team", "/team", (!isZzp && canTeam) || isAdmin],
      ["leave", "/verlof", !isZzp || isAdmin],
      ["activity", "/activiteit", (!isZzp && canTeam) || isAdmin],
      ["invoices", "/invoices", canFinance],
      ["recurring", "/recurring", canFinance],
      ["products", "/products", canFinance],
      ["assets", "/assets", canFinance],
      ["reports", "/reports", canFinance],
      ["quotes", "/quotes", canFinance],
      ["snelleOfferte", "/snelle-offerte", canFinance],
      ["expenses", "/expenses", canFinance],
      ["bank", "/bank", canFinance],
      ["vat", "/btw", canFinance],
      ["projects", "/projects", canFinance],
      ["customers", "/customers", canFinance],
      ["settings", "/settings", true],
      ["desktop", "/desktop", true],
      ["admin", "/admin", isAdmin],
    ];
    const actions: [string, string, string, boolean][] = [
      ["newInvoice", "invoices", "/invoices/new", canFinance],
      ["newQuote", "quotes", "/quotes/new", canFinance && !hidden.includes("quotes")],
      ["quickQuote", "snelleOfferte", "/snelle-offerte", canFinance && !hidden.includes("snelleOfferte")],
    ];
    return [
      ...actions
        .filter(([, , , show]) => show)
        .map(([key, icon, href]) => ({ key, icon, href, label: t(`actions.${key}`), group: "action" as const })),
      ...nav
        .filter(([key, , show]) => show && !hidden.includes(key))
        .map(([key, href]) => ({ key, icon: key, href, label: tn(key), group: "nav" as const })),
    ];
  }, [isZzp, canFinance, canTeam, isAdmin, hidden, t, tn]);

  // Simpele fuzzy-score: begin van het label > begin van een woord > ergens
  // erin. Secundair op groep sorteren, zodat "Snelle acties" en "Ga naar"
  // aaneengesloten blijven en groepskoppen niet herhalen.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items
      .map((item) => {
        const label = item.label.toLowerCase();
        let score = -1;
        if (label.startsWith(q)) score = 0;
        else if (label.split(/\s+/).some((w) => w.startsWith(q))) score = 1;
        else if (label.includes(q)) score = 2;
        return { item, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => {
        if (a.item.group !== b.item.group) return a.item.group === "action" ? -1 : 1;
        return a.score - b.score;
      })
      .map((r) => r.item);
  }, [items, query]);

  // SNELHEID: sidebar-<Link>s prefetchen automatisch, maar router.push vanuit
  // de palette niet — daardoor voelde navigeren via de zoekbalk traag. Zodra
  // de palette opent, prefetchen we alle bestemmingen één keer alvast.
  const prefetched = useRef(false);
  useEffect(() => {
    if (!open || prefetched.current) return;
    prefetched.current = true;
    for (const item of items) {
      try {
        router.prefetch(item.href);
      } catch {
        // prefetch is best-effort; navigeren werkt ook zonder
      }
    }
  }, [open, items, router]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelected(0);
    // Focus terug naar de triggerknop — anders "verdwijnt" de focus voor
    // toetsenbord- en screenreader-gebruikers.
    triggerRef.current?.focus();
  }, []);

  const go = useCallback(
    (item: PaletteItem) => {
      close();
      router.push(item.href);
    },
    [close, router],
  );

  // Globale sneltoets: Ctrl+K / Cmd+K opent, Escape sluit. Tijdens een
  // rondleiding blijft de sneltoets uit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (tourActive()) return;
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Selectie binnen bereik houden en in beeld scrollen.
  useEffect(() => {
    if (selected >= results.length) setSelected(0);
  }, [results, selected]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onInputKey = (e: React.KeyboardEvent) => {
    // Tab bladert door de resultaten (Shift+Tab terug) — sneller dan de
    // pijltjestoetsen en de focus blijft netjes in het zoekveld.
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      setSelected((s) => (results.length === 0 ? 0 : (s + 1) % results.length));
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      setSelected((s) => (results.length === 0 ? 0 : (s - 1 + results.length) % results.length));
    } else if (e.key === "Enter" && results[selected]) {
      e.preventDefault();
      go(results[selected]);
    }
  };

  let lastGroup: string | null = null;

  return (
    <>
      {/* Trigger in de header — laat de sneltoets zien */}
      <button
        ref={triggerRef}
        onClick={() => {
          if (!tourActive()) setOpen(true);
        }}
        className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-1.5 pl-3 pr-2 text-sm text-slate-400 transition-colors duration-200 hover:border-white/20 hover:text-white sm:flex"
      >
        <Icon name="search" className="h-4 w-4" />
        <span className="hidden lg:block">{t("trigger")}</span>
        <kbd className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
          {mac ? "⌘ K" : "Ctrl K"}
        </kbd>
      </button>

      {/* Geen fullscreen backdrop-blur op de overlay: dat is zwaar voor de
          GPU en maakte het openen/typen merkbaar traag op tragere machines.
          Portal naar <body>: anders zit de overlay gevangen in de stacking-
          context van de sticky header (z-10) en painten body-portals zoals
          de mobiele tabbalk er dwars doorheen. */}
      {open &&
        mounted &&
        createPortal(
        <div className="fixed inset-0 z-[110] flex items-start justify-center bg-black/70 p-4 pt-[12vh]" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("trigger")}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#a855f7]/25 bg-[#120c26] shadow-[0_0_80px_-16px_rgba(124,58,237,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
              <Icon name="search" className="h-5 w-5 shrink-0 text-brand-300" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={onInputKey}
                placeholder={t("placeholder")}
                className="w-full bg-transparent text-[15px] text-white placeholder-slate-500 outline-none"
              />
              <kbd className="shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="scrollbar-brand max-h-[46vh] overflow-y-auto p-2">
              {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">{t("empty")}</p>}
              {results.map((item, i) => {
                const showHeader = item.group !== lastGroup;
                lastGroup = item.group;
                return (
                  <div key={`${item.group}-${item.key}`}>
                    {showHeader && (
                      <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {t(item.group === "action" ? "actionsGroup" : "navGroup")}
                      </p>
                    )}
                    <button
                      data-index={i}
                      onClick={() => go(item)}
                      onMouseMove={() => setSelected(i)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors duration-100",
                        i === selected ? "bg-brand-600 text-white shadow-glow" : "text-slate-300",
                      )}
                    >
                      <NavIcon name={item.icon} />
                      {item.label}
                      {item.group === "action" && (
                        <span className={cn("ml-auto text-[10px] font-semibold uppercase tracking-wide", i === selected ? "text-white/70" : "text-brand-300/70")}>
                          {t("actionTag")}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
