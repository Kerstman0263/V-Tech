"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { faqAnswerKey, faqLink } from "@/lib/faq";
import { guaranteeMessageValues } from "@/lib/export-guarantee";
import { useIsLaunched } from "@/components/company/LaunchStatus";

// Standaardvragen op de homepage: de belangrijkste bezwaren eerst
// (veiligheid, export, wat als Saldova stopt, opzeggen/wisselen).
const DEFAULT_ITEMS = ["security", "exportData", "stopping", "changePlan", "avg", "cancel"];

// `namespace` laat een pagina (bijv. /webshops) eigen vragen gebruiken met
// dezelfde opbouw: <namespace>.<key>.q / .a
export function Faq({ items, namespace = "faq" }: { items?: string[]; namespace?: string }) {
  const t = useTranslations(namespace);
  // Antwoorden over "vóór de lancering" krijgen na de lancering hun vervolgtekst (lib/faq.ts).
  const launched = useIsLaunched();
  const answerKey = (key: string) => (namespace === "faq" ? faqAnswerKey(key, launched) : `${key}.a`);
  const ITEMS = items ?? DEFAULT_ITEMS;
  const [open, setOpen] = useState<string | null>(ITEMS[0] ?? null);

  return (
    <div className="mx-auto max-w-2xl divide-y divide-rand rounded-2xl border border-rand bg-kaart">
      {ITEMS.map((key) => {
        const isOpen = open === key;
        // Doorverwijzing onder het antwoord (lib/faq.ts), alleen bij de algemene FAQ.
        const link = namespace === "faq" ? faqLink(key) : null;
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
                {/* De waarden vullen plaatshouders zoals {days} (exportgarantie); andere antwoorden negeren ze. */}
                <p className="px-6 pb-5 text-sm leading-relaxed text-slate-400">{t(answerKey(key), guaranteeMessageValues())}</p>
                {link && (
                  <p className="-mt-2 px-6 pb-5 text-sm">
                    <Link
                      href={link}
                      tabIndex={isOpen ? undefined : -1}
                      className="rounded font-semibold text-saldova-licht underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht"
                    >
                      {t(`${key}.link`)} →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
