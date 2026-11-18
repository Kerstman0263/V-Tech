import { useTranslations } from "next-intl";

// Band met waar Saldova mee werkt, in twee eerlijke rijen:
// 1. Direct koppelen: echte koppelingen met een webshop (alleen leesrechten).
// 2. Importeren uit: bestanden die je zelf uploadt (bank-CSV, exports van andere pakketten).
// Bewust als tekst (geen merklogo's). Online betalen (Mollie/iDEAL) staat er pas bij
// als betalen live is. Pas de lijsten aan als er iets bijkomt of afvalt.
const CONNECT = ["Shopify", "WooCommerce", "Bol.com"];
const IMPORT_FROM = ["Moneybird", "e-Boekhouden", "Jortt"];

export function IntegrationsMarquee() {
  const t = useTranslations("home");

  const rows = [
    { key: "connect", label: t("integrations.connect"), items: CONNECT },
    { key: "import", label: t("integrations.import"), items: [t("integrations.bankCsv"), ...IMPORT_FROM, t("integrations.excel")] },
  ];

  return (
    <section className="border-y border-rand bg-kaart/40 px-4 py-8 sm:px-6">
      <h2 className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t("worksWith")}</h2>
      <div className="mx-auto mt-6 grid max-w-6xl gap-6 md:grid-cols-[auto_1fr] md:items-baseline md:gap-x-8 md:gap-y-4">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-saldova-licht md:text-left">{row.label}</p>
            <ul className="-mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:mt-0 md:justify-start">
              {row.items.map((name) => (
                <li key={name} className="whitespace-nowrap font-display text-base font-bold text-slate-300 sm:text-lg">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
