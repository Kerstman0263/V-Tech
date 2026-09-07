import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ease-in-out active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        variant === "primary" && "bg-brand-600 text-white shadow-glow hover:bg-brand-500 hover:shadow-glow-md",
        variant === "secondary" && "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
        variant === "ghost" && "text-slate-400 hover:bg-white/5 hover:text-white",
        variant === "danger" && "bg-rose-600 text-white shadow-[0_0_16px_-4px_rgba(225,29,72,0.6)] hover:bg-rose-500",
        className,
      )}
      {...props}
    />
  );
}
