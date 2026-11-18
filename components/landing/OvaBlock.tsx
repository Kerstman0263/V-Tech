import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { OvaEi, Woordmerk, type OvaMerk } from "@/components/ova-ei";
import { OVA_PRODUCTS } from "@/lib/ova";
import { cn } from "@/lib/utils";

/**
 * Merkkleur van het woordmerk per Ova-merk. Volledige klassenamen, zodat Tailwind ze ziet.
 * Op donker de lichte tinten; op licht (de home) een donkerdere tint voor genoeg contrast.
 */
const MERK_KLEUR: Record<OvaMerk, { dark: string; light: string }> = {
  ova: { dark: "text-[#ece6df]", light: "text-[#0b0b0b]" },
  cloudova: { dark: "text-[#f5c04a]", light: "text-[#9c5e06]" },
  wardova: { dark: "text-[#00c6ab]", light: "text-[#00806e]" },
  saldova: { dark: "text-[#a78bfa]", light: "text-[#6d28d9]" },
};

/**
 * Compact Ova-blok voor de footer: Ova Groep en de drie producten, elk met hun ei en
 * woordmerk in hun eigen kleur. Cloudova en Wardova openen in een nieuw tabblad.
 * `light` volgt de lichte variant van de SiteFooter.
 */
export function OvaBlock({ light = false, className }: { light?: boolean; className?: string }) {
  const t = useTranslations("ova");
  const tone = light ? "light" : "dark";

  const card = cn(
    "group flex h-full flex-col rounded-2xl border p-4 transition-colors",
    light ? "border-slate-200 bg-white hover:border-slate-300" : "border-[#1f2937] bg-[#11161d] hover:border-white/20",
  );
  const muted = light ? "text-slate-500" : "text-slate-400";
  // Kleine tekst: minstens 4,5:1 contrast op de kaart (#11161d) en op wit.
  const faint = light ? "text-slate-600" : "text-slate-400";

  return (
    <section aria-labelledby="ova-block-title" className={cn("space-y-4", className)}>
      <div className="flex items-center gap-3">
        <OvaEi merk="ova" licht={light} className="h-7 w-auto" />
        <div>
          <p className={cn("text-xs", faint)}>{t("block.partOf")}</p>
          <h2 id="ova-block-title" className={cn("mt-0.5 text-sm", light ? "text-slate-900" : "text-white")}>
            <Woordmerk naam="Ova" kleur="" className={MERK_KLEUR.ova[tone]} />{" "}
            <span className={cn("font-medium", muted)}>{t("block.group")}</span>
          </h2>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {OVA_PRODUCTS.map((product) => {
          const current = product.key === "saldova";
          const inner = (
            <>
              <div className="flex items-center gap-2.5">
                <OvaEi merk={product.key} className="h-6 w-auto" />
                <Woordmerk
                  naam={product.name}
                  kleur={MERK_KLEUR[product.key][tone]}
                  className={cn("text-sm", light ? "text-slate-900" : "text-white")}
                />
              </div>
              <p className={cn("mt-2 text-sm leading-snug", muted)}>{t(`products.${product.key}.what`)}</p>
              <p className={cn("mt-auto pt-2 text-xs", faint)}>
                {current ? t("block.current") : t(`products.${product.key}.price`)}
                {!current && (
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5" aria-hidden>
                    ↗
                  </span>
                )}
              </p>
            </>
          );
          return (
            <li key={product.key}>
              {current ? (
                <Link href="/" className={card}>
                  {inner}
                </Link>
              ) : (
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={card}
                >
                  {inner}
                  <span className="sr-only"> {t("block.newTab")}</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
