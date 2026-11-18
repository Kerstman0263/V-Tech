import { useTranslations } from "next-intl";
import { OvaEi, type OvaMerk } from "@/components/ova-ei";
import { OVA_BUNDLES, OVA_BUNDLE_EXAMPLE, OVA_PRODUCTS, euro } from "@/lib/ova";
import { cn } from "@/lib/utils";

/** Volgorde van de spelregels in messages (ova.rules.<key>); gelijk aan OVA_BUNDLE_RULES in lib/ova.ts. */
export const OVA_RULE_KEYS = ["counts", "wardova", "discount", "payment"] as const;

/** Welke eieren bij welke bundel horen. Saldova staat altijd vooraan: dit is de Saldova-site. */
const BUNDLE_EGGS: Record<(typeof OVA_BUNDLES)[number]["key"], OvaMerk[]> = {
  duo: ["saldova", "cloudova"],
  compleet: ["saldova", "cloudova", "wardova"],
};

/**
 * Blok "Ova-bundels": vaste maandkorting als je naast Saldova ook Cloudova en/of Wardova
 * gebruikt. Bedragen komen uit lib/ova.ts, teksten uit messages (namespace "ova").
 * Werkt in server- en clientcomponenten.
 */
export function OvaBundles({
  id = "ova-bundels",
  className,
  launched = false,
}: {
  id?: string;
  className?: string;
  /** Lanceerstatus (isLaunched() uit lib/company.ts, op de server bepaald). */
  launched?: boolean;
}) {
  const t = useTranslations("ova");
  const titleId = `${id}-title`;

  return (
    <section id={id} aria-labelledby={titleId} className={cn("bg-[#0b0f14] py-16 text-slate-200 sm:py-20", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex items-center justify-center gap-2" aria-hidden>
            {OVA_PRODUCTS.map((product) => (
              <OvaEi key={product.key} merk={product.key} className="h-9 w-auto" />
            ))}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">{t("bundles.eyebrow")}</p>
          <h2 id={titleId} className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("bundles.title")}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-slate-400">{t("bundles.intro")}</p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {OVA_BUNDLES.map((bundle) => (
            <article key={bundle.key} className="rounded-2xl border border-[#1f2937] bg-[#11161d] p-6">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-white">{t(`bundles.${bundle.key}.name`)}</h3>
                <div className="flex shrink-0 items-center gap-1" aria-hidden>
                  {BUNDLE_EGGS[bundle.key].map((merk) => (
                    <OvaEi key={merk} merk={merk} className="h-6 w-auto" />
                  ))}
                </div>
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-white">
                {euro(bundle.discount)}{" "}
                <span className="text-sm font-normal text-slate-400">{t("bundles.perMonth")}</span>
              </p>
              <p className="mt-2 text-sm text-slate-300">{t(`bundles.${bundle.key}.summary`)}</p>
            </article>
          ))}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-[#1f2937] bg-[#11161d] p-6">
            <h3 className="text-base font-semibold text-white">{t("rules.title")}</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
              {OVA_RULE_KEYS.map((key) => (
                <li key={key} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa]" aria-hidden />
                  {t(`rules.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#1f2937] bg-[#11161d] p-6">
            <h3 className="text-base font-semibold text-white">{t("example.title")}</h3>
            <dl className="mt-4 space-y-2.5 text-sm">
              {OVA_BUNDLE_EXAMPLE.lines.map((line) => (
                <div key={line.key} className="flex justify-between gap-4">
                  <dt className="flex items-center gap-2 text-slate-300">
                    <OvaEi merk={line.key} className="h-4 w-auto" />
                    {t(`example.lines.${line.key}`)}
                  </dt>
                  <dd className="tabular-nums text-slate-100">{euro(line.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-[#1f2937] pt-2.5">
                <dt className="text-slate-300">{t("example.subtotal")}</dt>
                <dd className="tabular-nums text-slate-100">{euro(OVA_BUNDLE_EXAMPLE.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-300">{t("example.discount")}</dt>
                <dd className="tabular-nums text-[#a78bfa]">− {euro(OVA_BUNDLE_EXAMPLE.discount)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-[#1f2937] pt-2.5 text-base font-semibold">
                <dt className="text-white">{t("example.total")}</dt>
                <dd className="tabular-nums text-white">{euro(OVA_BUNDLE_EXAMPLE.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">{t("example.note")}</p>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-pretty text-center text-sm leading-relaxed text-slate-400">
          {t(launched ? "bundles.honestLaunched" : "bundles.honest")}
        </p>
      </div>
    </section>
  );
}
