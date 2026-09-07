import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

/**
 * Gebrande laad-indicator: gradient-badge met de "V", een draaiende
 * gradient-ring, wordmark en een subtiele laadbalk.
 *
 * 👉 Logo straks vervangen: zet je bestand in /public (bijv. logo.svg) en
 *    vervang het <span>V</span>-blok hieronder door:
 *      <Image src="/logo.svg" alt="Saldova" width={36} height={36} priority />
 *    (import Image from "next/image" bovenaan).
 */
export function BrandLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-5",
        fullScreen ? "min-h-screen" : "min-h-[60vh]",
      )}
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        {/* Draaiende gradient-ring */}
        <svg
          className="absolute inset-0 h-full w-full animate-spin"
          style={{ animationDuration: "1.1s" }}
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="vtech-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c4b5fd" />
              <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="44" stroke="#f5f3ff" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r="44"
            stroke="url(#vtech-ring)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="150 130"
          />
        </svg>

        {/* Badge met logo */}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg shadow-brand-600/20 animate-logo-pulse">
          <Logo className="h-12 w-12" loading />
        </div>
      </div>

      {/* Wordmark */}
      <div className="animate-fade-pulse text-center">
        <p className="text-sm font-bold tracking-tight text-white">
          Saldo<span className="text-brand-400">va</span>
        </p>
      </div>

      {/* Indeterminate laadbalk */}
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/5">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-brand-400 to-brand-600 animate-loading-bar" />
      </div>
    </div>
  );
}
