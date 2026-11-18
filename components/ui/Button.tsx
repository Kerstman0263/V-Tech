import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

/**
 * Knopstijl van Saldova binnen Ova, ook bruikbaar op een <Link> of <a>:
 * `className={buttonClass("primary", "lg")}`.
 *
 * - primary: wit vlak met donkere tekst, rustig, zonder gloed.
 * - secondary: donkere kaart met zachte rand.
 * - accent: effen in de paneelkleur (brand-600), voor selecties en actieve keuzes.
 * - ghost / danger: zoals voorheen.
 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-200 ease-in-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
    size === "md" ? "px-4 py-2 text-sm" : "min-h-12 px-6 py-3 text-base",
    variant === "primary" && "bg-white text-[#0b0f14] hover:bg-slate-100 focus-visible:outline-saldova-licht",
    variant === "secondary" && "border border-rand bg-kaart text-white hover:bg-white/[0.06] focus-visible:outline-saldova-licht",
    variant === "accent" && "bg-brand-600 text-white hover:bg-brand-500 focus-visible:outline-brand-300",
    variant === "ghost" && "text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline-saldova-licht",
    variant === "danger" && "bg-rose-600 text-white hover:bg-rose-500 focus-visible:outline-rose-300",
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}
