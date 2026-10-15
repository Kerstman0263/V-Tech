"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

const SOLUTIONS: { key: "zzp" | "shop" | "team"; href: "/zzp" | "/webshops" | "/bedrijven"; icon: IconName; isNew?: boolean }[] = [
  { key: "zzp", href: "/zzp", icon: "user" },
  { key: "shop", href: "/webshops", icon: "store", isNew: true },
  { key: "team", href: "/bedrijven", icon: "users" },
];

// Desktop-navigatie van de marketingsite: "Oplossingen"-uitklapmenu,
// actieve pagina gemarkeerd. Toegankelijk: knop met aria-expanded,
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
          <span className="rounded-full bg-brand-500/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand-200">{t("new")}</span>
        </button>

        <div
          className={cn(
            "absolute left-1/2 top-full z-30 mt-3 w-[min(92vw,640px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#110c26]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl transition-all duration-200",
            open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
          )}
        >
          <div className="grid gap-1 sm:grid-cols-3">
            {SOLUTIONS.map((s) => (
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
                  {s.isNew && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">{t("new")}</span>}
                </span>
                <span className="mt-3 font-semibold text-white">{t(`sol.${s.key}.title`)}</span>
                <span className="mt-1 text-xs leading-relaxed text-slate-400">{t(`sol.${s.key}.desc`)}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 group-hover:text-white">
                  {t("discover")} <Icon name="arrow-right" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
            <span>{t("demoHint")}</span>
            <Link href="/login" className="font-semibold text-brand-300 hover:text-white">{t("demoCta")} →</Link>
          </div>
        </div>
      </div>

      <Link href="/#features" className={cn(base, idle)}>{t("features")}</Link>
      <Link href="/zzp#pricing" className={cn(base, idle)}>{t("pricing")}</Link>
      <Link href="/about" className={cn(base, isActive("/about") ? active : idle)}>{t("about")}</Link>
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
