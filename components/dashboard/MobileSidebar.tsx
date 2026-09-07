"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { SidebarContent } from "@/components/dashboard/SidebarContent";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import type { Plan } from "@prisma/client";

interface Props {
  isAdmin?: boolean;
  isOwner?: boolean;
  canTeam?: boolean;
  isZzp?: boolean;
  canFinance?: boolean;
  plan?: Plan;
  trialDaysLeft?: number | null;
  /** Door de gebruiker verborgen modules (menu-voorkeur uit Instellingen). */
  hidden?: string[];
  newKeys?: string[];
}

// Geavanceerde mobiele navigatie: een app-achtige bottom-tabbalk voor de
// belangrijkste secties + een premium slide-in drawer met het volledige menu.
// Alleen zichtbaar < md; op desktop neemt de vaste zijbalk het over.
export function MobileSidebar({ isAdmin = false, isOwner = true, canTeam, isZzp = true, canFinance = true, plan = "FREE", trialDaysLeft = null, hidden = [], newKeys = [] }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Swipe-to-close
  const dragX = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);

  useEffect(() => setMounted(true), []);

  // Sluit de drawer zodra je navigeert.
  useEffect(() => setOpen(false), [pathname]);

  // Achtergrond-scroll blokkeren + Escape sluit.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Belangrijkste secties voor de tabbalk (rol-bewust, max 4 + Menu).
  // Verborgen modules blijven ook uit de tabbalk (menu-voorkeur).
  const primary: { key: string; href: string; icon: IconName }[] = [{ key: "dashboard", href: "/dashboard", icon: "chart" }];
  if (canFinance) primary.push({ key: "invoices", href: "/invoices", icon: "receipt" });
  primary.push({ key: "time", href: "/time", icon: "clock" });
  primary.push(isZzp ? { key: "mileage", href: "/mileage", icon: "car" } : { key: "leave", href: "/verlof", icon: "sun" });
  const tabs = primary.filter((p) => !hidden.includes(p.key)).slice(0, 4);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Touch-handlers voor swipe-to-close op de drawer.
  const onTouchStart = (e: React.TouchEvent) => { dragX.current = e.touches[0].clientX; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragX.current == null) return;
    setDrag(Math.min(0, e.touches[0].clientX - dragX.current));
  };
  const onTouchEnd = () => {
    if (drag < -70) setOpen(false);
    dragX.current = null;
    setDrag(0);
  };

  const portalContent = (
    <div className="md:hidden">
      {/* Scrim */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Drawer */}
      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={open && drag ? { transform: `translateX(${drag}px)` } : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-[90] flex w-[82%] max-w-[320px] flex-col rounded-r-3xl border-r border-white/10 bg-gradient-to-b from-ink-900 to-ink-950 p-4 text-slate-300 shadow-2xl shadow-black/60",
          drag ? "" : "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Sleep-hendel + sluitknop */}
        <div className="absolute right-3 top-3 z-10">
          <button
            onClick={() => setOpen(false)}
            aria-label={t("close")}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x-circle" className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent isAdmin={isAdmin} isOwner={isOwner} canTeam={canTeam} isZzp={isZzp} canFinance={canFinance} plan={plan} trialDaysLeft={trialDaysLeft} hidden={hidden} newKeys={newKeys} onNavigate={() => setOpen(false)} />
      </aside>

      {/* Bottom-tabbalk */}
      <nav
        aria-label={t("mobileNav")}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[70] flex items-stretch border-t border-white/10 bg-[#0b0a16]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-transform duration-300",
          open ? "translate-y-full" : "translate-y-0",
        )}
      >
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className="group relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5"
            >
              {active && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-400 shadow-glow" />}
              <span className={cn("flex h-6 w-6 items-center justify-center transition-transform group-active:scale-90", active ? "text-brand-300" : "text-slate-500")}>
                <Icon name={tab.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className={cn("text-[10px] font-medium", active ? "text-brand-200" : "text-slate-500")}>{t(tab.key)}</span>
            </Link>
          );
        })}
        {/* Menu-tab opent de drawer */}
        <button onClick={() => setOpen(true)} className="group flex flex-1 flex-col items-center justify-center gap-1 py-2.5">
          <span className="flex h-6 w-6 items-center justify-center text-slate-500 transition-transform group-active:scale-90">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </span>
          <span className="text-[10px] font-medium text-slate-500">{t("menu")}</span>
        </button>
      </nav>
    </div>
  );

  return (
    <>
      {/* Hamburger in de topbar (blijft ook beschikbaar) */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t("menu")}
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 md:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {mounted && createPortal(portalContent, document.body)}
    </>
  );
}
