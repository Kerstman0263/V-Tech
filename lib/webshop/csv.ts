import { delimiterFor, records } from "@/lib/fiscal-csv";
import { parseAmount } from "@/lib/bank-parse";
import { round2, type NormalizedOrder } from "./types";

/**
 * Leest order-exports (CSV) van webshops en marktplaatsen in: Shopify, Etsy,
 * WooCommerce, Lightspeed, Amazon, Bol.com, Mollie, PayPal of een eigen
 * spreadsheet. We herkennen kolommen aan veelgebruikte namen (NL + EN), dus
 * er is geen vaste indeling nodig. Pure functie: draait in de browser
 * (voorvertoning) én in tests.
 *
 * Shopify zet elke productregel op een eigen rij met hetzelfde ordernummer;
 * de orderbedragen staan alleen op de eerste rij. Daarom groeperen we per id.
 */

const ALIASES = {
  id: ["name", "order", "order #", "order id", "order number", "ordernummer", "bestelnummer", "bestelling", "order-id", "order nr", "id", "amazon-order-id", "transaction id", "transactie-id"],
  date: ["created at", "paid at", "date", "order date", "sale date", "datum", "besteldatum", "orderdatum", "date created", "purchase-date", "aangemaakt op"],
  total: ["total", "order total", "order value", "totaal", "totaalbedrag", "bedrag", "amount", "gross", "bruto", "total price", "item-price", "order totaal"],
  tax: ["taxes", "tax", "tax total", "order tax", "sales tax", "vat", "btw", "btw-bedrag", "tax amount", "item-tax", "total tax"],
  shipping: ["shipping", "shipping total", "verzendkosten", "verzending", "shipping price", "order shipping"],
  fees: ["fee", "fees", "kosten", "commission", "commissie", "transaction fee", "card processing fees", "transactiekosten", "processing fee"],
  country: ["shipping country", "ship country", "shipping country code", "country", "land", "billing country", "afleverland", "bezorgland", "ship-country", "verzendland"],
  currency: ["currency", "valuta", "munt", "currency code"],
  status: ["financial status", "status", "order status", "payment status", "betaalstatus"],
  company: ["shipping company", "billing company", "company", "bedrijf", "bedrijfsnaam"],
  refunded: ["refunded amount", "terugbetaald", "refund amount"],
} as const;

type Field = keyof typeof ALIASES;

const norm = (s: string) => s.trim().toLowerCase().replace(/^﻿/, "").replace(/\s+/g, " ");

/** Landnamen (NL/EN) en codes → ISO-2. Alleen wat we voor btw nodig hebben. */
const COUNTRY_NAMES: Record<string, string> = {
  netherlands: "NL", nederland: "NL", "the netherlands": "NL", holland: "NL",
  belgium: "BE", "belgië": "BE", belgie: "BE", belgique: "BE",
  germany: "DE", duitsland: "DE", deutschland: "DE",
  france: "FR", frankrijk: "FR",
  luxembourg: "LU", luxemburg: "LU",
  austria: "AT", oostenrijk: "AT", "österreich": "AT",
  spain: "ES", spanje: "ES", "españa": "ES",
  italy: "IT", "italië": "IT", italie: "IT", italia: "IT",
  portugal: "PT",
  ireland: "IE", ierland: "IE",
  denmark: "DK", denemarken: "DK",
  sweden: "SE", zweden: "SE",
  finland: "FI",
  poland: "PL", polen: "PL",
  "czech republic": "CZ", czechia: "CZ", "tsjechië": "CZ", tsjechie: "CZ",
  slovakia: "SK", slowakije: "SK",
  slovenia: "SI", "slovenië": "SI", slovenie: "SI",
  hungary: "HU", hongarije: "HU",
  romania: "RO", "roemenië": "RO", roemenie: "RO",
  bulgaria: "BG", bulgarije: "BG",
  croatia: "HR", "kroatië": "HR", kroatie: "HR",
  greece: "GR", griekenland: "GR",
  cyprus: "CY", malta: "MT",
  estonia: "EE", estland: "EE",
  latvia: "LV", letland: "LV",
  lithuania: "LT", litouwen: "LT",
  "united kingdom": "GB", "verenigd koninkrijk": "GB", uk: "GB",
  "united states": "US", "verenigde staten": "US", usa: "US",
  switzerland: "CH", zwitserland: "CH", norway: "NO", noorwegen: "NO",
};

export function toCountryCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase() === "EL" ? "GR" : v.toUpperCase();
  return COUNTRY_NAMES[v.toLowerCase()] ?? null;
}

/** Datum in allerlei vormen → YYYY-MM-DD. Schuine strepen = Europees (d/m/j). */
export function toIsoDate(raw: string): string | null {
  const v = raw.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})(?!\d)/);
  if (m) return valid(2000 + +m[3], +m[2], +m[1]);
  const t = Date.parse(v); // bijv. "Mar 4, 2026"
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return valid(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const REFUND_STATUS = /refund|terugbetaal|retour|returned|credit/i;
const SKIP_STATUS = /cancel|geannuleerd|voided|failed|mislukt|pending|in afwachting/i;

export interface CsvOrderResult {
  orders: NormalizedOrder[];
  skipped: number;
  /** Welke kolommen we herkenden (voor uitleg in de UI). */
  recognized: Field[];
  error?: "EMPTY" | "NO_COLUMNS" | "TOO_MANY_ROWS";
}

export const MAX_CSV_ORDERS = 5000;

export function parseOrderCsv(text: string, sourceKey = "csv"): CsvOrderResult {
  if (!text.trim()) return { orders: [], skipped: 0, recognized: [], error: "EMPTY" };
  const delimiter = delimiterFor(text);
  const it = records(text, delimiter);
  const header = it.next();
  if (header.done) return { orders: [], skipped: 0, recognized: [], error: "EMPTY" };
  const heads = header.value.cells.map(norm);

  const col: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      const i = heads.indexOf(alias);
      if (i > -1) { col[field] = i; break; }
    }
  }
  const recognized = Object.keys(col) as Field[];
  if (col.date === undefined || col.total === undefined) {
    return { orders: [], skipped: 0, recognized, error: "NO_COLUMNS" };
  }

  const get = (cells: string[], f: Field) => (col[f] === undefined ? "" : (cells[col[f]!] ?? "").trim());
  const num = (cells: string[], f: Field) => {
    const v = parseAmount(get(cells, f));
    return Number.isFinite(v) ? v : 0;
  };

  const orders: NormalizedOrder[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let rowNo = 0;

  for (const rec of it) {
    rowNo++;
    if (!rec.valid) { skipped++; continue; }
    const cells = rec.cells;
    const rawId = get(cells, "id") || `rij-${rowNo}`;
    // Volgregels van dezelfde order (Shopify-productregels) overslaan zonder te tellen.
    if (seen.has(rawId)) continue;

    const totalRaw = parseAmount(get(cells, "total"));
    const date = toIsoDate(get(cells, "date"));
    if (!Number.isFinite(totalRaw) || !date) {
      // Een productregel zonder orderbedrag hoort bij een order die we al hebben.
      if (get(cells, "id") && !get(cells, "total")) continue;
      skipped++;
      continue;
    }
    const status = get(cells, "status");
    if (SKIP_STATUS.test(status) && !REFUND_STATUS.test(status)) { skipped++; continue; }
    seen.add(rawId);

    const isRefund = totalRaw < 0 || (REFUND_STATUS.test(status) && !/partial|gedeeltelijk/i.test(status));
    const gross = Math.abs(totalRaw);
    const vat = Math.min(Math.abs(num(cells, "tax")), gross);
    const currency = (get(cells, "currency") || "EUR").toUpperCase().slice(0, 3);
    const base: NormalizedOrder = {
      externalId: `${sourceKey}:${rawId}`,
      orderNumber: get(cells, "id") || null,
      kind: isRefund ? "REFUND" : "SALE",
      orderDate: date,
      country: toCountryCode(get(cells, "country")),
      currency,
      totalGross: round2(gross),
      vatAmount: round2(vat),
      shippingGross: round2(Math.abs(num(cells, "shipping"))),
      fees: round2(Math.abs(num(cells, "fees"))),
      // Bedrijfsnaam + geen btw = waarschijnlijk zakelijk (btw verlegd).
      isBusiness: !!get(cells, "company") && vat === 0 && gross > 0,
    };
    orders.push(base);

    // Gedeeltelijke terugbetaling (Shopify "Refunded Amount") als losse retour.
    const refunded = Math.abs(num(cells, "refunded"));
    if (!isRefund && refunded > 0) {
      const share = gross > 0 ? Math.min(refunded / gross, 1) : 0;
      orders.push({ ...base, externalId: `${base.externalId}:refund`, kind: "REFUND", totalGross: round2(refunded), vatAmount: round2(vat * share), shippingGross: 0, fees: 0 });
    }
    if (orders.length > MAX_CSV_ORDERS) return { orders: [], skipped, recognized, error: "TOO_MANY_ROWS" };
  }

  return { orders, skipped, recognized };
}
