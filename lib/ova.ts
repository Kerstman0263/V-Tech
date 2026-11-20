/**
 * Ova Groep: de drie producten en de bundelkorting. Dezelfde cijfers staan in Cloudova
 * (repo nestova: src/lib/bedrijf.ts en src/lib/prijs.ts) en Wardova (src/lib/ova.ts). Houd ze gelijk.
 *
 * Alle bedragen per maand, excl. btw, maandelijks opzegbaar.
 *
 * De teksten op de site komen uit messages/*.json (namespace "ova"); de Nederlandse teksten
 * hieronder zijn de bron en een test controleert dat nl.json ermee overeenkomt.
 */

export type OvaProductKey = "cloudova" | "wardova" | "saldova";

export type OvaProduct = {
  key: OvaProductKey;
  name: string;
  /** Deel van de naam vóór "ova", voor het tweekleurige logo. */
  stem: string;
  url: string;
  what: string;
  /** Korte prijsregel. */
  price: string;
  /** Accentkleur van het product. */
  accent: string;
};

export const OVA_PRODUCTS: readonly OvaProduct[] = [
  {
    key: "cloudova",
    name: "Cloudova",
    stem: "Cloud",
    url: "https://cloudova.vercel.app",
    what: "Websites bouwen en hosten. Je past je site zelf aan.",
    price: "€ 15 per pagina per maand",
    accent: "#dc9e09",
  },
  {
    key: "wardova",
    name: "Wardova",
    stem: "Ward",
    url: "https://wardova.vercel.app",
    what: "Beveiliging voor websites: scanner, meldingen en firewall.",
    price: "Gratis, of Pro voor € 9 per domein per maand",
    accent: "#00c6ab",
  },
  {
    key: "saldova",
    name: "Saldova",
    stem: "Sald",
    url: "https://saldova.vercel.app",
    what: "Facturen, uren en belasting voor zzp'ers, starters en webshops.",
    price: "Gratis, betaald vanaf € 15 per maand",
    accent: "#7c3aed",
  },
] as const;

/** Vaste korting per maand als je meerdere betaalde Ova-producten gebruikt. */
export const OVA_BUNDLES = [
  {
    key: "duo",
    name: "Ova Duo",
    products: 2,
    discount: 5,
    summary: "Twee Ova-producten: € 5 per maand korting.",
  },
  {
    key: "compleet",
    name: "Ova Compleet",
    products: 3,
    discount: 15,
    summary: "Alle drie de Ova-producten: € 15 per maand korting.",
  },
] as const;

export type OvaBundleKey = (typeof OVA_BUNDLES)[number]["key"];

/** Spelregels, in gewone taal. Toon deze bij elke bundel. */
export const OVA_BUNDLE_RULES = [
  "Het telt als je van elk product een betaald pakket hebt: Cloudova met minstens één pagina, Saldova vanaf Groei, Wardova Pro voor minstens één domein.",
  "Wardova zit al gratis bij je Cloudova-site. Voor de bundel telt Wardova Pro voor een ander domein, bijvoorbeeld je webshop.",
  "De korting gaat elke maand van je totaal af. Maandelijks opzegbaar, geen opstartkosten.",
  "Online betalen kan nog niet. We verrekenen de korting op je maandfactuur.",
] as const;

/** Rekenvoorbeeld voor de prijzenpagina's. `key` is de vertaalsleutel in messages (ova.example.lines.<key>). */
export const OVA_BUNDLE_EXAMPLE = {
  lines: [
    { key: "cloudova", label: "Cloudova, site met 5 pagina's", amount: 75 },
    { key: "saldova", label: "Saldova Pro", amount: 29 },
    { key: "wardova", label: "Wardova Pro, 1 extra domein", amount: 9 },
  ],
  subtotal: 113,
  discount: 15,
  total: 98,
} as const;

export function euro(amount: number): string {
  return `€ ${amount.toLocaleString("nl-NL")}`;
}
