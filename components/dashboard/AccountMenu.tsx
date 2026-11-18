"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter, routing } from "@/i18n/routing";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useTextSize } from "@/components/dashboard/TextSizeToggle";
import { cn } from "@/lib/utils";

type Locale = (typeof routing.locales)[number];

/** Talen in hun eigen taal, zoals gebruikelijk in een taalkeuze. */
const LANGUAGE_NAMES: Record<string, string> = { nl: "Nederlands", en: "English" };

/**
 * Avatar in de kopbalk met een klein menu: taal, grotere tekst, instellingen en
 * uitloggen. Op een telefoon is dit de plek voor die knoppen (de kopbalk is dan
 * te smal); vanaf sm staan ze daarnaast ook nog los in de balk.
 */
export function AccountMenu({ initials, displayName, email }: { initials: string; displayName: string; email: string }) {
  const t = useTranslations("appExtra.accountMenu");
  const tn = useTranslations("nav");
  const tdash = useTranslations("dashboard");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [large, toggleLarge] = useTextSize();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Sluiten bij navigeren, Escape en klikken buiten het menu.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const row =
    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]";

  return (
    <div ref={wrapRef} className="relative flex items-center gap-2 border-l border-white/10 pl-3 sm:pl-4">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("open")}
        className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa] focus-visible:ring-offset-2 focus-visible:ring-offset-grond"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-glow">{initials}</span>
        <span className="hidden max-w-[12rem] truncate text-sm font-medium text-slate-300 sm:block">{displayName}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="region"
          aria-label={t("open")}
          className="absolute right-0 top-12 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-rand bg-kaart p-2 shadow-2xl shadow-black/60"
        >
          <div className="px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold text-white">{displayName}</p>
            {email && email !== displayName && <p className="truncate text-xs text-slate-400">{email}</p>}
          </div>

          <div className="border-t border-rand pt-2">
            <p id={`${menuId}-lang`} className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t("language")}
            </p>
            <div role="group" aria-labelledby={`${menuId}-lang`} className="grid grid-cols-2 gap-1 px-1 pb-2">
              {routing.locales.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  aria-pressed={loc === locale}
                  lang={loc}
                  onClick={() => {
                    setOpen(false);
                    if (loc !== locale) router.replace(pathname, { locale: loc as Locale });
                  }}
                  className={cn(
                    "min-h-11 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]",
                    loc === locale ? "bg-white text-grond" : "border border-rand text-slate-200 hover:bg-white/[0.06]",
                  )}
                >
                  {LANGUAGE_NAMES[loc] ?? loc.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-rand pt-2">
            <button type="button" aria-pressed={large} onClick={toggleLarge} className={row}>
              <span aria-hidden className="flex w-4 items-baseline justify-center text-slate-400">
                <span className="text-[10px] font-semibold">A</span>
                <span className="text-sm font-semibold">A</span>
              </span>
              <span className="flex-1">{tdash("textSize")}</span>
              <span
                aria-hidden
                className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", large ? "bg-saldova" : "bg-white/15")}
              >
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", large ? "left-[18px]" : "left-0.5")} />
              </span>
            </button>
            <Link href="/settings" onClick={() => setOpen(false)} className={row}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
              </svg>
              {tn("settings")}
            </Link>
            <LogoutButton variant="menu" />
          </div>
        </div>
      )}
    </div>
  );
}
