"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Gestylede dropdown die de (niet te stylen) native <select> vervangt.
 * Sluit bij klik-buiten en Escape; toetsenbord: pijltjes + Enter.
 * `buttonClassName` overschrijft de trigger-styling (bijv. voor gekleurde pills).
 */
export function Select({
  value,
  onChange,
  options,
  label,
  placeholder,
  className,
  buttonClassName,
  menuAlign = "left",
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuAlign?: "left" | "right";
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectId = useId();
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, options, value]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = options[active]; if (o) { onChange(o.value); setOpen(false); } }
  }

  const defaultBtn =
    "flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white outline-none transition-colors hover:border-white/20 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <label htmlFor={selectId} className="text-sm font-medium text-slate-300">{label}</label>}
      <div ref={ref} className="relative">
        <button
          id={selectId}
          role="combobox"
          aria-controls={open ? `${selectId}-list` : undefined}
          aria-activedescendant={open && options[active] ? `${selectId}-option-${active}` : undefined}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel ?? label}
          onClick={() => !disabled && setOpen((o) => !o)}
          onKeyDown={onKeyDown}
          className={buttonClassName ?? defaultBtn}
        >
          <span className={cn("truncate", !selected && "text-slate-500")}>{selected ? selected.label : placeholder ?? ""}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("shrink-0 opacity-60 transition-transform", open && "rotate-180")} aria-hidden>
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <ul
            id={`${selectId}-list`}
            aria-label={ariaLabel ?? label}
            role="listbox"
            className={cn(
              "absolute z-30 mt-1 max-h-60 min-w-full overflow-auto rounded-xl border border-white/10 bg-[#161430] p-1 shadow-2xl shadow-black/50 backdrop-blur-md",
              menuAlign === "right" ? "right-0" : "left-0",
            )}
          >
            {options.map((o, i) => {
              const isSel = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${selectId}-option-${i}`}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm",
                    i === active ? "bg-brand-500/15 text-brand-200" : "text-slate-300",
                    isSel && "font-semibold",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {isSel && <span className="text-brand-400">✓</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
