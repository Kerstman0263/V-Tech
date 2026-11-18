"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Deur-met-pijl, het gangbare teken voor uitloggen. */
function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/**
 * Uitloggen.
 * - `text` (standaard): gewone tekstknop, voor losse schermen.
 * - `icon`: compacte icoonknop voor de kopbalk, met de tekst als aria-label en tooltip.
 * - `menu`: volle regel in een menu (icoon + tekst).
 */
export function LogoutButton({ variant = "text", className }: { variant?: "text" | "icon" | "menu"; className?: string }) {
  const t = useTranslations("common");
  const logout = () => signOut({ callbackUrl: "/" });

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={logout}
        aria-label={t("logout")}
        title={t("logout")}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]",
          className,
        )}
      >
        <LogoutIcon className="h-4 w-4" />
      </button>
    );
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={logout}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]",
          className,
        )}
      >
        <LogoutIcon className="h-4 w-4 text-slate-400" />
        {t("logout")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={logout}
      className={cn("rounded-md text-sm text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]", className)}
    >
      {t("logout")}
    </button>
  );
}
