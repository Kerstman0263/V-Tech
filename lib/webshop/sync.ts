import { round2, type NormalizedOrder } from "./types";

/**
 * Pure hulpfuncties voor de webshopsynchronisatie (zonder database), zodat de
 * voortgang en het bijwerken van bestellingen los te testen zijn.
 *
 * Voortgang: een sync haalt per keer maximaal een paar pagina's op. Was er
 * meer, dan bewaren we WAAR we waren (de Shopify-cursor of het paginanummer)
 * in WebshopConnection.syncCursor, en gaat de volgende ronde precies daar
 * verder, binnen hetzelfde venster. We zetten de voortgang dus nooit meer op
 * een orderdatum of retourdatum: dat liet bestellingen stil wegvallen.
 */

/** Bij de eerste sync halen we zoveel dagen terug op. */
export const FIRST_SYNC_DAYS = 120;
/** Overlap bij een gewone sync: wijzigingen rond de vorige sync niet missen. */
export const SYNC_OVERLAP_DAYS = 2;
const DAY = 86_400_000;

export interface SyncCursor {
  /** Begin van het venster dat we doorlopen (ISO-tijdstip). */
  since: string;
  /** Wanneer deze doorloop begon (ISO). Wordt lastSyncAt zodra hij klaar is. */
  startedAt: string;
  /** Shopify: endCursor van de laatst verwerkte pagina. */
  after?: string | null;
  /** WooCommerce en Bol.com: de pagina waar de volgende ronde begint. */
  page?: number;
}

/** Waar de volgende ronde verdergaat, zoals een platform dat teruggeeft. */
export type SyncPosition = Pick<SyncCursor, "after" | "page">;

export function parseSyncCursor(raw: string | null | undefined): SyncCursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<SyncCursor>;
    if (typeof c.since !== "string" || typeof c.startedAt !== "string") return null;
    if (Number.isNaN(Date.parse(c.since)) || Number.isNaN(Date.parse(c.startedAt))) return null;
    const out: SyncCursor = { since: c.since, startedAt: c.startedAt };
    if (typeof c.after === "string" && c.after) out.after = c.after;
    if (typeof c.page === "number" && Number.isInteger(c.page) && c.page >= 1) out.page = c.page;
    return out;
  } catch {
    return null;
  }
}

export interface SyncWindow {
  since: Date;
  startedAt: Date;
  /** Gezet als we een onderbroken sync voortzetten. */
  resume: SyncCursor | null;
  /**
   * Eenmalige inhaalronde: deze koppeling is gesynchroniseerd vóór de
   * herstelde voortgang (lastRunAt is leeg). Toen kon lastSyncAt te ver
   * vooruit springen, waardoor bestellingen zijn overgeslagen. Daarom halen
   * we nu het hele venster sinds het koppelen opnieuw op.
   */
  catchUp: boolean;
}

/** De koppeling zoals syncWindow hem nodig heeft. */
export interface SyncWindowInput {
  lastSyncAt: Date | null;
  syncCursor?: string | null;
  /** Leeg (null) = nog nooit gesynchroniseerd sinds de herstelde voortgang. */
  lastRunAt?: Date | null;
  createdAt?: Date;
}

/** Welk venster de volgende ronde ophaalt. */
export function syncWindow(conn: SyncWindowInput, now: Date = new Date()): SyncWindow {
  const resume = parseSyncCursor(conn.syncCursor);
  if (resume) return { since: new Date(resume.since), startedAt: new Date(resume.startedAt), resume, catchUp: false };
  if (!conn.lastSyncAt) return { since: new Date(now.getTime() - FIRST_SYNC_DAYS * DAY), startedAt: now, resume: null, catchUp: false };
  const normal = new Date(conn.lastSyncAt.getTime() - SYNC_OVERLAP_DAYS * DAY);
  // Oude koppeling (lastRunAt bestaat, maar is leeg): de oude voortgang kon
  // gaten laten. Eén keer alles opnieuw, vanaf het venster van de eerste
  // sync. Dat is veilig: bekende bestellingen worden bijgewerkt, niet dubbel
  // opgeslagen. Daarna staat lastRunAt en gaat het weer gewoon.
  if (conn.lastRunAt === null) {
    const from = (conn.createdAt ?? now).getTime() - FIRST_SYNC_DAYS * DAY;
    return { since: new Date(Math.min(from, normal.getTime())), startedAt: now, resume: null, catchUp: true };
  }
  return { since: normal, startedAt: now, resume: null, catchUp: false };
}

/**
 * Wat we na een ronde opslaan.
 * - Nog niet klaar: lastSyncAt blijft staan (als vangnet) en de cursor wijst
 *   naar de volgende pagina binnen hetzelfde venster.
 * - Klaar: lastSyncAt wordt het BEGIN van deze doorloop, zodat wijzigingen die
 *   tijdens een lange doorloop binnenkwamen de volgende keer meekomen.
 */
export function syncStateAfter(
  prevLastSyncAt: Date | null,
  window: SyncWindow,
  result: { hasMore: boolean; next?: SyncPosition },
): { lastSyncAt: Date | null; syncCursor: string | null } {
  if (!result.hasMore) return { lastSyncAt: window.startedAt, syncCursor: null };
  const cursor: SyncCursor = { since: window.since.toISOString(), startedAt: window.startedAt.toISOString() };
  if (result.next?.after) cursor.after = result.next.after;
  if (result.next?.page) cursor.page = result.next.page;
  return { lastSyncAt: prevLastSyncAt, syncCursor: JSON.stringify(cursor) };
}

// --------------------------------------------------------------------------
// Bestellingen opslaan en bijwerken
// --------------------------------------------------------------------------

/** Velden van een WebshopOrder-rij die uit het platform komen. */
export function orderRowData(o: NormalizedOrder, now: Date) {
  return {
    externalId: o.externalId.slice(0, 190),
    orderNumber: o.orderNumber?.slice(0, 100) ?? null,
    kind: o.kind,
    orderDate: new Date(`${o.orderDate}T00:00:00Z`),
    country: o.country,
    currency: o.currency,
    totalGross: o.totalGross,
    vatAmount: o.vatAmount,
    shippingGross: o.shippingGross,
    fees: o.fees,
    isBusiness: o.isBusiness,
    cancelledAt: o.cancelled ? now : null,
  };
}

type Money = number | string | { toString(): string };

export interface StoredOrder {
  orderNumber: string | null;
  orderDate: Date;
  country: string | null;
  currency: string;
  totalGross: Money;
  vatAmount: Money;
  shippingGross: Money;
  fees: Money;
  isBusiness: boolean;
  cancelledAt: Date | null;
}

const cents = (v: Money) => round2(Number(v.toString()));

/**
 * Wat er aan een opgeslagen bestelling moet veranderen nu het platform hem
 * anders teruggeeft (bedrag aangepast, geannuleerd, toch doorgegaan).
 * Geeft null als alles gelijk is. Het soort (verkoop/retour) en het externe id
 * veranderen nooit.
 */
export function orderUpdate(row: StoredOrder, o: NormalizedOrder, now: Date): Partial<ReturnType<typeof orderRowData>> | null {
  const next = orderRowData(o, now);
  const data: Partial<ReturnType<typeof orderRowData>> = {};
  if (row.orderNumber !== next.orderNumber) data.orderNumber = next.orderNumber;
  // Een benaderde datum (keepStoredDate) verschuift een opgeslagen rij niet.
  if (!o.keepStoredDate && row.orderDate.getTime() !== next.orderDate.getTime()) data.orderDate = next.orderDate;
  if (row.country !== next.country) data.country = next.country;
  if (row.currency !== next.currency) data.currency = next.currency;
  if (cents(row.totalGross) !== cents(next.totalGross)) data.totalGross = next.totalGross;
  if (cents(row.vatAmount) !== cents(next.vatAmount)) data.vatAmount = next.vatAmount;
  if (cents(row.shippingGross) !== cents(next.shippingGross)) data.shippingGross = next.shippingGross;
  if (cents(row.fees) !== cents(next.fees)) data.fees = next.fees;
  if (row.isBusiness !== next.isBusiness) data.isBusiness = next.isBusiness;
  // Geannuleerd-moment niet steeds verschuiven: alleen bij een echte overgang.
  if (!!row.cancelledAt !== !!o.cancelled) data.cancelledAt = o.cancelled ? now : null;
  return Object.keys(data).length ? data : null;
}

// --------------------------------------------------------------------------
// Wijzigingen in kwartalen die al voorbij zijn
// --------------------------------------------------------------------------

export interface Quarter { year: number; quarter: number }

/** Kwartaal van een opgeslagen orderdatum (YYYY-MM-DDT00:00Z). */
export function quarterOf(d: Date): Quarter {
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}

/** Het lopende kwartaal, op de Nederlandse kalender (niet UTC). */
export function currentQuarter(now: Date): Quarter {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(now); // YYYY-MM-DD
  return { year: Number(day.slice(0, 4)), quarter: Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1 };
}

const qKey = (q: Quarter) => q.year * 10 + q.quarter;

/** Een bestelling die bij een sync is aangepast: de oude rij en wat veranderde. */
export interface OrderChange {
  externalId: string;
  kind: "SALE" | "REFUND";
  before: StoredOrder;
  data: Partial<ReturnType<typeof orderRowData>>;
}

/** Een nieuw opgeslagen rij (zoals orderRowData hem maakt). */
export type NewOrderRow = ReturnType<typeof orderRowData>;

/** Telt deze nieuwe rij mee in omzet en OSS? Een geannuleerde niet. */
const counts = (r: NewOrderRow) => !r.cancelledAt;

/** Valt deze datum in een kwartaal dat al voorbij is? */
export function isPastQuarter(d: Date, now: Date): boolean {
  return qKey(quarterOf(d)) < qKey(currentQuarter(now));
}

/**
 * Welke al afgelopen kwartalen een wijziging raakt (oude en nieuwe orderdatum),
 * en welke een NIEUWE rij die in zo'n kwartaal valt (een nagekomen
 * bestelling of retour). Over zo'n kwartaal kan de btw- of OSS-aangifte al
 * gedaan zijn; de gebruiker moet dat zelf nagaan. Gesorteerd, zonder dubbele.
 */
export function pastQuartersOf(changes: OrderChange[], now: Date, added: NewOrderRow[] = []): Quarter[] {
  const cur = qKey(currentQuarter(now));
  const seen = new Map<number, Quarter>();
  const dates = [
    ...changes.flatMap((c) => [c.before.orderDate, c.data.orderDate]),
    ...added.filter(counts).map((r) => r.orderDate),
  ];
  for (const d of dates) {
    if (!d) continue;
    const q = quarterOf(d);
    if (qKey(q) < cur) seen.set(qKey(q), q);
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, q]) => q);
}

/** De nieuwe rijen die in een afgelopen kwartaal vallen en meetellen. */
export function newRowsInPastQuarters(added: NewOrderRow[], now: Date): NewOrderRow[] {
  return added.filter((r) => counts(r) && isPastQuarter(r.orderDate, now));
}

const eur = (v: Money) => Number(v.toString()).toFixed(2).replace(".", ",");
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Leesbare regel voor het activiteitenlogboek: welke bestelling, welk
 * kwartaal, en per veld de oude en de nieuwe waarde. Zo blijft na te gaan wat
 * er achteraf in een aangegeven kwartaal is veranderd.
 */
export function describeOrderChange(c: OrderChange, shop: string): string {
  const q = quarterOf(c.before.orderDate);
  const label = `${shop} — ${c.kind === "REFUND" ? "retour" : "bestelling"} ${c.before.orderNumber ?? c.externalId} (${q.year} K${q.quarter})`;
  const parts: string[] = [];
  const d = c.data;
  if (d.cancelledAt !== undefined) parts.push(d.cancelledAt ? "geannuleerd, telt niet meer mee" : "toch doorgegaan, telt weer mee");
  if (d.orderDate) parts.push(`datum ${day(c.before.orderDate)} → ${day(d.orderDate)}`);
  if (d.totalGross !== undefined) parts.push(`bedrag ${eur(c.before.totalGross)} → ${eur(d.totalGross)}`);
  if (d.vatAmount !== undefined) parts.push(`btw ${eur(c.before.vatAmount)} → ${eur(d.vatAmount)}`);
  if (d.shippingGross !== undefined) parts.push(`verzending ${eur(c.before.shippingGross)} → ${eur(d.shippingGross)}`);
  if (d.fees !== undefined) parts.push(`kosten ${eur(c.before.fees)} → ${eur(d.fees)}`);
  if (d.country !== undefined) parts.push(`land ${c.before.country ?? "?"} → ${d.country ?? "?"}`);
  if (d.currency !== undefined) parts.push(`valuta ${c.before.currency} → ${d.currency}`);
  if (d.isBusiness !== undefined) parts.push(d.isBusiness ? "nu zakelijk" : "nu particulier");
  if (d.orderNumber !== undefined) parts.push(`nummer ${c.before.orderNumber ?? "-"} → ${d.orderNumber ?? "-"}`);
  return `${label}: ${parts.join("; ")}`;
}

/**
 * Logregel voor een nieuwe rij in een kwartaal dat al voorbij is: een
 * bestelling of retour die pas na afloop van het kwartaal binnenkwam.
 */
export function describeNewOrder(r: NewOrderRow, shop: string): string {
  const q = quarterOf(r.orderDate);
  const what = r.kind === "REFUND" ? "retour" : "bestelling";
  const label = `${shop} — nieuwe ${what} ${r.orderNumber ?? r.externalId} (${q.year} K${q.quarter})`;
  const effect = r.kind === "REFUND" ? "gaat af van de omzet" : "telt mee in de omzet";
  return `${label}: pas na afloop van het kwartaal opgehaald, ${effect}; datum ${day(r.orderDate)}; bedrag ${eur(r.totalGross)}; btw ${eur(r.vatAmount)}${r.country ? `; land ${r.country}` : ""}`;
}
