"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { MAIN_SOLUTIONS, SECONDARY_SOLUTION } from "@/lib/site-focus";

const SOLUTIONS = [...MAIN_SOLUTIONS, SECONDARY_SOLUTION];

// Desktop-navigatie van de marketingsite: "Oplossingen"-uitklapmenu met de
// twee hoofdroutes (zzp, webshop) en daaronder, kleiner, bedrijven met
// personeel (lib/site-focus.ts). Actieve pagina gemarkeerd. Toegankelijk: knop met aria-expanded,
// sluit met Escape of een klik erbuiten.
export function SiteNav({ light = false }: { light?: boolean }) {
  const t = useTranslations("landing.nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const base = "rounded-lg px-3 py-2 transition-colors";
  const idle = light ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900" : "text-slate-300 hover:bg-white/[0.06] hover:text-white";
  const active = light ? "text-slate-900" : "text-white bg-white/[0.06]";
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const solutionActive = SOLUTIONS.some((s) => isActive(s.href));

  return (
    <nav className="hidden items-center gap-0.5 text-sm font-medium lg:flex" aria-label={t("menu")}>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="true"
          className={cn(base, "inline-flex items-center gap-1.5", solutionActive ? active : idle)}
        >
          {t("solutions")}
          <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </button>

        <div
          className={cn(
            "absolute left-1/2 top-full z-30 mt-3 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-rand bg-kaart p-3 shadow-2xl shadow-black/60 transition-all duration-200",
            open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
          )}
        >
          <div className="grid gap-1 sm:grid-cols-2">
            {MAIN_SOLUTIONS.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className={cn(
                  "group flex flex-col rounded-xl p-4 transition-colors hover:bg-white/[0.05]",
                  isActive(s.href) && "bg-white/[0.05]",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200 ring-1 ring-brand-400/20">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                </span>
                <span className="mt-3 font-semibold text-white">{t(`sol.${s.key}.title`)}</span>
                <span className="mt-1 text-xs leading-relaxed text-slate-400">{t(`sol.${s.key}.desc`)}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 group-hover:text-white">
                  {t("discover")} <Icon name="arrow-right" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
          <Link
            href={SECONDARY_SOLUTION.href}
            className={cn(
              "group mt-1 flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.05]",
              isActive(SECONDARY_SOLUTION.href) && "bg-white/[0.05]",
            )}
          >
            <Icon name={SECONDARY_SOLUTION.icon} className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-200">{t(`sol.${SECONDARY_SOLUTION.key}.title`)}</span>
              <span className="block text-xs leading-relaxed text-slate-400">{t(`sol.${SECONDARY_SOLUTION.key}.desc`)}</span>
            </span>
            <Icon name="arrow-right" className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
          </Link>
          <div className="mt-1 flex items-center justify-between gap-3 rounded-xl bg-grond px-4 py-3 text-xs text-slate-400">
            <span>{t("demoHint")}</span>
            <Link href="/login" className="font-semibold text-brand-300 hover:text-white">{t("demoCta")} →</Link>
          </div>
        </div>
      </div>

      <Link href="/#features" className={cn(base, idle)}>{t("features")}</Link>
      <Link href="/zzp#pricing" className={cn(base, idle)}>{t("pricing")}</Link>
      <Link href="/overstappen" className={cn(base, isActive("/overstappen") ? active : idle)}>{t("switch")}</Link>
      <Link href="/faq" className={cn(base, isActive("/faq") ? active : idle)}>{t("faq")}</Link>
      <Link href="/contact" className={cn(base, isActive("/contact") ? active : idle)}>{t("support")}</Link>
    </nav>
  );
}

/** Voegt een schaduw/steviger achtergrond toe aan de header zodra je scrolt. */
export function HeaderScrollShadow() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    const onScroll = () => header.toggleAttribute("data-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}
