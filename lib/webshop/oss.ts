import { round2, type NormalizedOrder } from "./types";

/**
 * Btw per EU-land en de OSS-drempel (één-loketsysteem).
 *
 * Regel (sinds 1 juli 2021): verkoop je op afstand aan CONSUMENTEN in andere
 * EU-landen voor meer dan € 10.000 per kalenderjaar (alle landen samen, excl.
 * btw), dan reken je het btw-tarief van het land van de klant. Daaronder mag
 * je het Nederlandse tarief houden. B2B-verkopen tellen niet mee.
 *
 * Standaardtarieven per land, peildatum oktober 2026. Controleer jaarlijks
 * (o.a. EE 24% per 1-7-2025, RO 21% per 1-8-2025, SK 23% per 2025, FI 25,5%).
 * We tonen dit als indicatie; het echte btw-bedrag komt uit de bestelling.
 */
export const EU_STANDARD_VAT: Record<string, number> = {
  AT: 20, BE: 21, BG: 20, HR: 25, CY: 19, CZ: 21, DK: 25, EE: 24, FI: 25.5,
  FR: 20, DE: 19, GR: 24, HU: 27, IE: 23, IT: 22, LV: 21, LT: 21, LU: 17,
  MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SK: 23, SI: 22, ES: 21, SE: 25,
};

export const HOME_COUNTRY = "NL";
export const OSS_THRESHOLD_EUR = 10_000;

export function isEuCountry(code: string | null | undefined): boolean {
  return !!code && code in EU_STANDARD_VAT;
}

type OrderLike = Pick<NormalizedOrder, "kind" | "orderDate" | "country" | "totalGross" | "vatAmount" | "isBusiness"> & {
  fees?: number;
  shippingGross?: number;
};

/** Teken: verkoop telt positief, retour negatief. */
const sign = (o: OrderLike) => (o.kind === "REFUND" ? -1 : 1);

export interface CountryRow {
  country: string;
  orders: number;
  net: number; // omzet excl. btw
  vat: number; // gerekende btw
  /** Effectief gerekend tarief (vat/net) in procenten, 1 decimaal. */
  effectiveRate: number | null;
  /** Standaardtarief van dit land (indicatie). */
  standardRate: number | null;
  /** Boven de drempel, maar er is (vrijwel) het NL-tarief gerekend i.p.v. het lokale. */
  rateMismatch: boolean;
}

export interface OssSummary {
  year: number;
  /** Grensoverschrijdende B2C-verkoop binnen de EU (excl. NL), excl. btw, dit jaar. */
  crossBorderNet: number;
  threshold: number;
  thresholdExceeded: boolean;
  /** Percentage van de drempel (0–100+), voor de meter. */
  thresholdPct: number;
  /** B2C-verkoop per EU-land buiten NL in de gekozen periode. */
  perCountry: CountryRow[];
  /** Verkoop naar NL in de gekozen periode (ter vergelijking). */
  domestic: { orders: number; net: number; vat: number };
  /** Bestellingen zonder bekend land (kunnen niet worden ingedeeld). */
  unknownCountry: number;
}

/** "2026-Q3" → [startInclusief, eindExclusief] als YYYY-MM-DD. */
export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): [string, string] {
  const startMonth = (quarter - 1) * 3 + 1;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const end = quarter === 4 ? `${year + 1}-01-01` : `${year}-${String(startMonth + 3).padStart(2, "0")}-01`;
  return [start, end];
}

export function quarterOf(date: string): 1 | 2 | 3 | 4 {
  const month = Number(date.slice(5, 7));
  return (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

/**
 * OSS-overzicht. De drempel kijkt naar het HELE kalenderjaar tot nu toe;
 * de tabel per land naar de gekozen periode (standaard het hele jaar).
 */
export function ossSummary(orders: OrderLike[], year: number, period?: [string, string]): OssSummary {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const [from, to] = period ?? [yearStart, yearEnd];

  let crossBorderNet = 0;
  let unknownCountry = 0;
  const domestic = { orders: 0, net: 0, vat: 0 };
  const map = new Map<string, { orders: number; net: number; vat: number }>();

  for (const o of orders) {
    if (o.isBusiness) continue;
    const s = sign(o);
    const net = s * (o.totalGross - o.vatAmount);
    const vat = s * o.vatAmount;
    const country = o.country?.toUpperCase() ?? null;

    if (o.orderDate >= yearStart && o.orderDate < yearEnd && isEuCountry(country) && country !== HOME_COUNTRY) {
      crossBorderNet += net;
    }
    if (o.orderDate < from || o.orderDate >= to) continue;
    if (!country) { unknownCountry++; continue; }
    if (country === HOME_COUNTRY) {
      domestic.orders += o.kind === "SALE" ? 1 : 0;
      domestic.net += net;
      domestic.vat += vat;
      continue;
    }
    if (!isEuCountry(country)) continue; // buiten de EU: export, geen OSS
    const row = map.get(country) ?? { orders: 0, net: 0, vat: 0 };
    row.orders += o.kind === "SALE" ? 1 : 0;
    row.net += net;
    row.vat += vat;
    map.set(country, row);
  }

  const thresholdExceeded = crossBorderNet > OSS_THRESHOLD_EUR;
  const perCountry: CountryRow[] = [...map.entries()]
    .map(([country, r]) => {
      const effectiveRate = r.net > 0 ? Math.round((r.vat / r.net) * 1000) / 10 : null;
      const standardRate = EU_STANDARD_VAT[country] ?? null;
      const nlRate = EU_STANDARD_VAT[HOME_COUNTRY];
      const rateMismatch =
        thresholdExceeded &&
        effectiveRate !== null &&
        standardRate !== null &&
        standardRate !== nlRate &&
        Math.abs(effectiveRate - nlRate) < 0.6;
      return { country, orders: r.orders, net: round2(r.net), vat: round2(r.vat), effectiveRate, standardRate, rateMismatch };
    })
    .sort((a, b) => b.net - a.net);

  return {
    year,
    crossBorderNet: round2(crossBorderNet),
    threshold: OSS_THRESHOLD_EUR,
    thresholdExceeded,
    thresholdPct: Math.round((crossBorderNet / OSS_THRESHOLD_EUR) * 100),
    perCountry,
    domestic: { orders: domestic.orders, net: round2(domestic.net), vat: round2(domestic.vat) },
    unknownCountry,
  };
}

export interface DayTotal {
  date: string;
  orders: number;
  refunds: number;
  gross: number; // verkoop − retour, incl. btw
  vat: number;
  fees: number;
}

/** Dagtotalen (nieuwste eerst): zo boek je honderden orders als één regel per dag. */
export function dailyTotals(orders: OrderLike[], limitDays = 31): DayTotal[] {
  const map = new Map<string, DayTotal>();
  for (const o of orders) {
    const d = map.get(o.orderDate) ?? { date: o.orderDate, orders: 0, refunds: 0, gross: 0, vat: 0, fees: 0 };
    const s = sign(o);
    if (o.kind === "SALE") d.orders++;
    else d.refunds++;
    d.gross += s * o.totalGross;
    d.vat += s * o.vatAmount;
    d.fees += o.fees ?? 0;
    map.set(o.orderDate, d);
  }
  return [...map.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limitDays)
    .map((d) => ({ ...d, gross: round2(d.gross), vat: round2(d.vat), fees: round2(d.fees) }));
}

export interface PeriodTotals {
  orders: number;
  refunds: number;
  gross: number;
  net: number;
  vat: number;
  fees: number;
}

export function periodTotals(orders: OrderLike[], from: string, to: string): PeriodTotals {
  const t: PeriodTotals = { orders: 0, refunds: 0, gross: 0, net: 0, vat: 0, fees: 0 };
  for (const o of orders) {
    if (o.orderDate < from || o.orderDate >= to) continue;
    const s = sign(o);
    if (o.kind === "SALE") t.orders++;
    else t.refunds++;
    t.gross += s * o.totalGross;
    t.vat += s * o.vatAmount;
    t.net += s * (o.totalGross - o.vatAmount);
    t.fees += o.fees ?? 0;
  }
  return { ...t, gross: round2(t.gross), net: round2(t.net), vat: round2(t.vat), fees: round2(t.fees) };
}
