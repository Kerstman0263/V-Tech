"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

// Mobiel menu voor de publieke site (< md). De desktop-nav in de header blijft
// zoals hij is; hier komt de hamburger + een premium slide-in paneel bij.
export function SiteMobileMenu({ light = false }: { light?: boolean }) {
  const t = useTranslations("landing.nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    { href: "/", label: t("home") },
    { href: "/zzp", label: t("forFreelancers") },
    { href: "/bedrijven", label: t("forCompanies") },
    { href: "/about", label: t("about") },
    { href: "/faq", label: t("faq") },
    { href: "/contact", label: t("contact") },
  ];

  const panel = (
    <div className="md:hidden">
      {/* Scrim */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn("fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm transition-opacity duration-300", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      {/* Paneel — schuift van rechts in */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-[100] flex w-[86%] max-w-[360px] flex-col border-l border-white/10 bg-gradient-to-b from-[#0f0e22] to-[#080711] p-6 shadow-2xl shadow-black/60 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Sfeergloed */}
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <Logo className="h-[25px] w-[25px]" />
            <span className="text-lg font-bold text-white">Saldo<span className="text-brand-400">va</span></span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label={t("close")}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <nav className="relative mt-8 flex flex-col gap-1">
          {links.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              style={{ transitionDelay: open ? `${80 + i * 45}ms` : "0ms" }}
              className={cn(
                "rounded-xl px-4 py-3 text-base font-semibold text-slate-200 transition-all duration-300 hover:bg-white/5 hover:text-white",
                open ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="relative mt-auto flex flex-col gap-2 pt-6">
          <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/5">
            {t("login")}
          </Link>
          <Link href="/register" onClick={() => setOpen(false)} className="rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-glow transition-all hover:bg-brand-500 hover:shadow-glow-md">
            {t("start")}
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("menu")}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors md:hidden",
          light ? "text-slate-700 hover:bg-slate-100" : "text-slate-300 hover:bg-white/10",
        )}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {mounted && createPortal(panel, document.body)}
    </>
  );
}
