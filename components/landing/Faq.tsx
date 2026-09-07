"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Standaardvragen op de homepage: de belangrijkste bezwaren eerst
// (veiligheid, export, opzeggen/wisselen).
const DEFAULT_ITEMS = ["security", "exportData", "changePlan", "avg", "cancel"];

export function Faq({ items }: { items?: string[] }) {
  const t = useTranslations("faq");
  const ITEMS = items ?? DEFAULT_ITEMS;
  const [open, setOpen] = useState<string | null>(ITEMS[0] ?? null);

  return (
    <div className="card-glass mx-auto max-w-2xl divide-y divide-white/[0.06]">
      {ITEMS.map((key) => {
        const isOpen = open === key;
        return (
          <div key={key}>
            <button
              onClick={() => setOpen(isOpen ? null : key)}
              className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
              aria-expanded={isOpen}
            >
              <span className={cn("font-medium transition-colors", isOpen ? "text-white" : "text-slate-200")}>
                {t(`${key}.q`)}
              </span>
              {/* Plus dat naar een kruis roteert */}
              <span
                className={cn(
                  "relative ml-4 h-4 w-4 shrink-0 text-brand-400 transition-transform duration-300",
                  isOpen && "rotate-[135deg]",
                )}
                aria-hidden
              >
                <span className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded bg-current" />
                <span className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-current" />
              </span>
            </button>
            {/* Vloeiende hoogte-animatie via grid-template-rows 0fr → 1fr */}
            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <p className="px-6 pb-5 text-sm leading-relaxed text-slate-400">{t(`${key}.a`)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
