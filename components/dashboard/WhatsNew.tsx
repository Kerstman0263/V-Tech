"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { WHATS_NEW, LATEST_WHATS_NEW_ID } from "@/lib/whats-new";

const SEEN_KEY = "saldova-whatsnew-seen";

/**
 * "Wat is er nieuw"-knop in de header. Een paars puntje zolang er functies
 * zijn die deze gebruiker (op dit apparaat) nog niet heeft bekeken; klik
 * opent het overzicht en markeert alles als gezien.
 */
export function WhatsNew() {
  const t = useTranslations("whatsNew");
  const locale = useLocale();
  const lang: "nl" | "en" = locale === "en" ? "en" : "nl";
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setUnseen(localStorage.getItem(SEEN_KEY) !== LATEST_WHATS_NEW_ID);
    } catch {
      /* geen localStorage: dan nooit een puntje */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        localStorage.setItem(SEEN_KEY, LATEST_WHATS_NEW_ID);
      } catch {
        /* negeren */
      }
      setUnseen(false);
    }
  }

  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={t("title")}
        aria-expanded={open}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
          open ? "border-brand-500/40 bg-brand-500/15 text-brand-200" : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-white",
        )}
      >
        <Icon name="zap" className="h-4 w-4" />
        {unseen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500 ring-2 ring-[#080711]" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#a855f7]/25 bg-[#12112a]/95 shadow-2xl shadow-black/60 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <p className="text-sm font-bold text-white">{t("title")}</p>
            <span className="text-[11px] text-slate-500">{t("count", { count: WHATS_NEW.length })}</span>
          </div>
          <ul className="scrollbar-brand max-h-[60vh] overflow-y-auto p-2">
            {WHATS_NEW.map((e, i) => (
              <li key={e.id} className="rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {e.title[lang]}
                    {i === 0 && <span className="ml-2 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-200">{t("latest")}</span>}
                  </p>
                  <span className="shrink-0 text-[11px] text-slate-500">{fmt(e.date)}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{e.body[lang]}</p>
                {e.href && (
                  <Link href={e.href} onClick={() => setOpen(false)} className="mt-1.5 inline-block text-xs font-semibold text-brand-300 hover:text-brand-200">
                    {t("open")} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
