"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { NavIcon } from "@/components/dashboard/SidebarContent";
import { TOGGLEABLE_MODULES, type ToggleableModule } from "@/lib/modules";

/**
 * Menu-personalisatie: zet modules die je niet gebruikt uit — ze verdwijnen
 * dan uit de zijbalk, de mobiele tabbalk en de zoekbalk (Ctrl+K). Weer
 * aanzetten kan altijd; er gaat nooit data verloren. Kernpagina's
 * (dashboard, facturen, instellingen...) zijn bewust niet uitzetbaar.
 *
 * Race-veilig (uit de adversariële review): state-updates zijn functioneel,
 * requests worden geserialiseerd zodat een langzame PUT een snellere nooit
 * overschrijft, en het serverantwoord is de bron van waarheid.
 */
export function ModuleToggles({
  initialHidden,
  isZzp,
  canFinance,
  canTeam,
}: {
  initialHidden: string[];
  isZzp: boolean;
  canFinance: boolean;
  canTeam: boolean;
}) {
  const t = useTranslations("settings.modules");
  const tn = useTranslations("nav");
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden));
  const [error, setError] = useState(false);
  // Serialiseert de PUTs; > 0 betekent: nog wijzigingen onderweg.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);

  // Na router.refresh de server-stand volgen — maar nooit midden in een
  // lopende wijziging, anders raakt een optimistische toggle kwijt.
  useEffect(() => {
    if (pendingRef.current === 0) setHidden(new Set(initialHidden));
  }, [initialHidden]);

  // Alleen modules tonen die deze gebruiker überhaupt te zien krijgt.
  const visibleFor = (m: ToggleableModule): boolean => {
    if (m === "activity") return !isZzp && canTeam;
    if (["quotes", "snelleOfferte", "expenses", "bank", "vat", "projects", "products", "recurring", "assets", "reports"].includes(m)) return canFinance;
    return true; // time, mileage, tasks
  };
  const modules = TOGGLEABLE_MODULES.filter(visibleFor);

  const toggle = (m: ToggleableModule) => {
    setError(false);
    let payload: string[] = [];
    // Functionele update: veilig bij snel achter elkaar klikken.
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      payload = [...next];
      return next;
    });

    pendingRef.current += 1;
    queueRef.current = queueRef.current.then(async () => {
      try {
        const res = await fetch("/api/user/modules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hidden: payload }),
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { hidden?: string[] };
        // Serverantwoord = waarheid, maar alleen toepassen als er geen
        // nieuwere wijziging meer in de rij staat.
        if (pendingRef.current === 1 && Array.isArray(data.hidden)) {
          setHidden(new Set(data.hidden));
        }
        router.refresh(); // zijbalk en zoekbalk zijn server-props
      } catch {
        // Alleen deze ene schakelaar terugdraaien — niet een oude snapshot.
        setHidden((prev) => {
          const next = new Set(prev);
          if (next.has(m)) next.delete(m);
          else next.add(m);
          return next;
        });
        setError(true);
      } finally {
        pendingRef.current -= 1;
      }
    });
  };

  return (
    <Card className="p-6">
      <h2 className="font-semibold text-white">{t("title")}</h2>
      <p className="mt-1 text-sm text-slate-400">{t("subtitle")}</p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {modules.map((m) => {
          const on = !hidden.has(m);
          return (
            <button
              key={m}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(m)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200",
                on ? "border-white/10 bg-white/[0.04] hover:border-white/20" : "border-white/[0.05] bg-transparent hover:border-white/10",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className={cn("shrink-0", on ? "text-brand-300" : "text-slate-600")}>
                  <NavIcon name={m} />
                </span>
                <span className="min-w-0">
                  {/* Ook in de uit-stand leesbaar — je moet kunnen teruglezen
                      wát je hebt uitgezet om het weer aan te kunnen zetten. */}
                  <span className={cn("block truncate text-sm font-medium", on ? "text-white" : "text-slate-400")}>{tn(m)}</span>
                  <span className="block truncate text-xs text-slate-400">{t(`desc.${m}`)}</span>
                </span>
              </span>
              {/* Schakelaar */}
              <span
                aria-hidden
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
                  on ? "bg-brand-600 shadow-glow" : "bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200",
                    on ? "left-[22px]" : "left-0.5",
                  )}
                />
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-400">
          {t("error")}
        </p>
      )}
      <p className="mt-4 text-xs text-slate-400">{t("note")}</p>
    </Card>
  );
}
