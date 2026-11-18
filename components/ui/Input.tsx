"use client";

import { cn } from "@/lib/utils";
import { useId, type InputHTMLAttributes } from "react";

/**
 * Gedeelde veldstijl (input, textarea, select) in de Ova-huisstijl: donkere grond,
 * zachte rand en een duidelijk zichtbare violette focusring voor toetsenbordgebruikers.
 */
export const fieldClass =
  "rounded-xl border border-rand bg-grond px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa] focus-visible:border-transparent";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ className, label, id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <input id={inputId} className={cn(fieldClass, "transition-colors", className)} {...props} />
    </div>
  );
}
