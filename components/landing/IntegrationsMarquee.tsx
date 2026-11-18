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
  const row = ITEMS;

  return (
    <section className="border-y border-white/[0.06] bg-white/[0.015] py-8">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("worksWith")}</p>
      <div className="mx-auto mt-5 max-w-6xl px-6">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {row.map((name, i) => (
            <li
              key={`${name}-${i}`}
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
