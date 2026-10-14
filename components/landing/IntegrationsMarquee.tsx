import { useTranslations } from "next-intl";

// Eindeloos schuivende band met diensten waar Saldova mee samenwerkt.
// Bewust als tekst (geen merklogo's): we tonen alleen waar een echte import
// of koppeling voor bestaat. Pas de lijst aan als er iets bijkomt of afvalt.
const ITEMS = [
  "ING",
  "Rabobank",
  "Knab",
  "Mollie",
  "iDEAL",
  "Peppol",
  "Shopify",
  "WooCommerce",
  "Bol.com",
  "Moneybird",
  "e-Boekhouden",
  "Jortt",
  "Excel / CSV",
];

export function IntegrationsMarquee() {
  const t = useTranslations("home");
  const row = [...ITEMS, ...ITEMS];

  return (
    <section className="border-y border-white/[0.06] bg-white/[0.015] py-8">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("worksWith")}</p>
      <div className="relative mt-5 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <ul className="flex w-max animate-marquee gap-12 pr-12">
          {row.map((name, i) => (
            <li
              key={`${name}-${i}`}
              aria-hidden={i >= ITEMS.length}
              className="whitespace-nowrap font-display text-lg font-bold text-slate-500 transition-colors hover:text-slate-200"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
