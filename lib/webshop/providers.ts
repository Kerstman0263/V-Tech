import { HttpError } from "@/lib/http-error";
import { round2, type NormalizedOrder } from "./types";
import { EU_STANDARD_VAT } from "./oss";
import { assertPublicHost, guardedFetch, normalizeShopUrl, normalizeShopifyDomain } from "./safe-url";
import { FIRST_SYNC_DAYS, type SyncPosition } from "./sync";

/**
 * Koppelingen met de webshopplatforms. Alle verzoeken zijn ALLEEN-LEZEN.
 *
 * - Shopify: Admin GraphQL API met een Admin-API-token van een eigen app
 *   (Instellingen → Apps → App ontwikkelen; scope read_orders).
 * - WooCommerce: REST API v3 met een consumer key/secret (alleen lezen).
 * - Bol.com: Retailer API v10 met client-id/secret (OAuth client credentials).
 *
 * Elke sync haalt maximaal MAX_PAGES pagina's op, zodat een serverless
 * functie niet over zijn tijdslimiet gaat. Was er meer, dan geeft de functie
 * terug WAAR de volgende sync verdergaat (`next`: Shopify-cursor of pagina);
 * zie lib/webshop/sync.ts.
 *
 * Geannuleerde bestellingen geven we terug met `cancelled: true` (niet meer
 * weglaten), zodat een eerder opgeslagen verkoop wordt gemarkeerd.
 */

export const MAX_PAGES = 8;
export { FIRST_SYNC_DAYS };
/** Shopify API-versie: kwartaalversies, ± 12 maanden ondersteund. Jaarlijks ophogen. */
export const SHOPIFY_API_VERSION = "2026-07";

export interface ShopifyCredentials { accessToken: string }
export interface WooCredentials { consumerKey: string; consumerSecret: string }
export interface BolCredentials { clientId: string; clientSecret: string }

export interface FetchResult {
  orders: NormalizedOrder[];
  /** true als er meer was dan we in één keer ophaalden. */
  hasMore: boolean;
  /** Bij hasMore: waar de volgende ronde verdergaat. */
  next?: SyncPosition;
  /**
   * Bol.com: bekende orders die we deze ronde opnieuw hebben opgevraagd (ook
   * als Bol ze niet meer gaf). Die krijgen checkedAt, zodat de volgende ronde
   * de volgende kandidaten neemt.
   */
  checked?: string[];
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};
const isoDay = (v: string) => new Date(v).toISOString().slice(0, 10);

// --------------------------------------------------------------------------
// Shopify
// --------------------------------------------------------------------------

interface ShopifyMoney { shopMoney?: { amount?: string } }
export interface ShopifyOrderNode {
  id: string;
  name: string;
  createdAt: string;
  currencyCode: string;
  totalPriceSet?: ShopifyMoney;
  totalTaxSet?: ShopifyMoney;
  totalShippingPriceSet?: ShopifyMoney;
  shippingAddress?: { countryCodeV2?: string | null } | null;
  billingAddress?: { countryCodeV2?: string | null; company?: string | null } | null;
  refunds?: { id: string; createdAt: string; totalRefundedSet?: ShopifyMoney }[];
  cancelledAt?: string | null;
  /** PAID, PARTIALLY_PAID, PENDING, AUTHORIZED, VOIDED, EXPIRED, (PARTIALLY_)REFUNDED. */
  displayFinancialStatus?: string | null;
}

/**
 * Shopify-betaalstatussen waarbij er (nog) geen geld is ontvangen: in
 * afwachting, alleen gereserveerd, vrijgegeven of verlopen. Alleen dan telt
 * een geannuleerde order niet mee. Onbekend of leeg = wel ontvangen (veilige
 * kant: liever btw over een verkoop die er was, dan een verkoop missen).
 */
const SHOPIFY_NOTHING_RECEIVED = new Set(["PENDING", "AUTHORIZED", "VOIDED", "EXPIRED"]);

/**
 * Shopify-order (GraphQL) → genormaliseerde verkoop + eventuele retouren.
 *
 * Geannuleerd:
 * - en er is nooit iets betaald (betaalstatus in afwachting, gereserveerd,
 *   vrijgegeven of verlopen): de verkoop krijgt `cancelled` en telt niet mee;
 * - met terugbetaling: verkoop en retour blijven allebei staan, elk op hun
 *   eigen datum. Zo klopt het met het geld dat binnenkwam en terugging, en
 *   verschuift een eerder kwartaal niet achteraf;
 * - betaald maar (nog) niet terugbetaald bij Shopify: de verkoop blijft
 *   staan. Over ontvangen geld is btw verschuldigd zolang het niet is
 *   terugbetaald. Betaal je buiten Shopify terug, dan verwerk je dat zelf.
 */
export function mapShopifyOrder(o: ShopifyOrderNode): NormalizedOrder[] {
  const gross = num(o.totalPriceSet?.shopMoney?.amount);
  const vat = num(o.totalTaxSet?.shopMoney?.amount);
  const country = (o.shippingAddress?.countryCodeV2 ?? o.billingAddress?.countryCodeV2 ?? null)?.toUpperCase() ?? null;
  const sale: NormalizedOrder = {
    externalId: o.id,
    orderNumber: o.name,
    kind: "SALE",
    orderDate: isoDay(o.createdAt),
    country,
    currency: o.currencyCode || "EUR",
    totalGross: round2(gross),
    vatAmount: round2(vat),
    shippingGross: round2(num(o.totalShippingPriceSet?.shopMoney?.amount)),
    fees: 0,
    isBusiness: !!o.billingAddress?.company && vat === 0 && gross > 0,
  };
  const refunds = (o.refunds ?? [])
    .map((r): NormalizedOrder | null => {
      const amount = num(r.totalRefundedSet?.shopMoney?.amount);
      if (amount <= 0) return null;
      // Shopify geeft geen btw per retour in dit overzicht: naar verhouding.
      const share = gross > 0 ? Math.min(amount / gross, 1) : 0;
      return { ...sale, externalId: `${o.id}:${r.id}`, kind: "REFUND", orderDate: isoDay(r.createdAt), totalGross: round2(amount), vatAmount: round2(vat * share), shippingGross: 0 };
    })
    .filter((r): r is NormalizedOrder => r !== null);
  const nothingReceived = !!o.displayFinancialStatus && SHOPIFY_NOTHING_RECEIVED.has(o.displayFinancialStatus);
  if (o.cancelledAt && refunds.length === 0 && nothingReceived) return [{ ...sale, cancelled: true }];
  return [sale, ...refunds];
}

// Sorteren op dezelfde sleutel als waarop we filteren (updated_at), zodat de
// cursor een vaste plek in het venster aanwijst: een order die tijdens het
// doorlopen verandert, schuift naar achteren en komt later alsnog mee.
const SHOPIFY_QUERY = `query Orders($cursor: String, $query: String) {
  orders(first: 100, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt currencyCode cancelledAt displayFinancialStatus
      totalPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      shippingAddress { countryCodeV2 }
      billingAddress { countryCodeV2 company }
      refunds { id createdAt totalRefundedSet { shopMoney { amount } } }
    }
  }
}`;

/**
 * Shopify weigerde de vraag zelf (GraphQL-fouten zonder bestellingen, of een
 * 400). Bij een voortgezette ronde kan dat aan de opgeslagen cursor liggen
 * (verlopen, of ongeldig na een API-wijziging): dan beginnen we het venster
 * opnieuw, zonder cursor.
 */
export class ShopifyQueryError extends HttpError {
  constructor(message: string) {
    super(422, message);
  }
}

/** De foutteksten uit een GraphQL-antwoord, kort en leesbaar (of null). */
export function shopifyErrorText(errors: unknown): string | null {
  const list: unknown[] = Array.isArray(errors) ? errors : errors ? [errors] : [];
  const texts = list
    .map((e) => (typeof e === "string" ? e : e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string" ? (e as { message: string }).message : null))
    .filter((t): t is string => !!t && !!t.trim())
    .map((t) => t.replace(/\s+/g, " ").trim());
  if (!texts.length) return null;
  const joined = [...new Set(texts)].join("; ");
  return joined.length > 200 ? `${joined.slice(0, 197)}...` : joined;
}

async function shopifyRequest(domain: string, token: string, variables: Record<string, unknown>) {
  const res = await guardedFetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: SHOPIFY_QUERY, variables }),
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(422, "Shopify accepteert dit token niet. Controleer het token en of de app de rechten read_orders heeft.");
  if (res.status === 404) throw new HttpError(422, "Deze Shopify-winkel bestaat niet. Controleer het adres (mijnwinkel.myshopify.com).");
  const body = (await res.json().catch(() => null)) as { data?: { orders?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrderNode[] } }; errors?: unknown } | null;
  if (res.status === 400 || res.status === 422) {
    const detail = shopifyErrorText(body?.errors);
    throw new ShopifyQueryError(detail ? `Shopify weigerde de vraag om bestellingen: ${detail}` : "Shopify weigerde de vraag om bestellingen. Probeer het later opnieuw.");
  }
  if (!res.ok || !body) throw new HttpError(502, "Shopify gaf een foutmelding. Probeer het later opnieuw.");
  if (!body.data?.orders) {
    // Te veel verzoeken is geen fout in de vraag (of de cursor): later opnieuw, op dezelfde plek.
    const codes = (Array.isArray(body.errors) ? body.errors : []).map((e) => (e as { extensions?: { code?: unknown } } | null)?.extensions?.code);
    if (codes.includes("THROTTLED")) throw new HttpError(429, "Shopify krijgt nu te veel verzoeken. Probeer het over een minuut opnieuw; de synchronisatie gaat dan verder waar hij was.");
    const detail = shopifyErrorText(body.errors);
    // Zonder fouttekst zijn ontbrekende leesrechten de gewone oorzaak.
    throw new ShopifyQueryError(detail ? `Shopify gaf geen bestellingen terug: ${detail}` : "Shopify gaf geen bestellingen terug. Heeft de app de rechten read_orders?");
  }
  return body.data.orders;
}

/** Het zoekfilter voor een venster (zelfde venster = zelfde filter, dan blijft de cursor geldig). */
export function shopifyQuery(since: Date): string {
  // updated_at i.p.v. created_at: zo komen ook retouren en annuleringen op oudere orders mee.
  return `updated_at:>=${since.toISOString().slice(0, 10)}`;
}

/**
 * @param after cursor van een onderbroken doorloop. Weigert Shopify die (zie
 *   ShopifyQueryError), dan beginnen we hetzelfde venster opnieuw zonder
 *   cursor. Dat is veilig: bekende bestellingen worden bijgewerkt, niet
 *   dubbel opgeslagen. Faalt ook dat, dan ligt het niet aan de cursor en
 *   tonen we de fout van Shopify.
 */
export async function fetchShopifyOrders(shop: string, creds: ShopifyCredentials, since: Date, after: string | null = null): Promise<FetchResult> {
  const domain = normalizeShopifyDomain(shop);
  const query = shopifyQuery(since);
  const orders: NormalizedOrder[] = [];
  let cursor: string | null = after;
  for (let page = 0; page < MAX_PAGES; page++) {
    let data: Awaited<ReturnType<typeof shopifyRequest>>;
    try {
      data = await shopifyRequest(domain, creds.accessToken, { cursor, query });
    } catch (err) {
      // Alleen de opgeslagen cursor van een voortgezette ronde, en maar één keer.
      if (page !== 0 || !after || !(err instanceof ShopifyQueryError)) throw err;
      cursor = null;
      data = await shopifyRequest(domain, creds.accessToken, { cursor, query });
    }
    for (const node of data.nodes) orders.push(...mapShopifyOrder(node));
    if (!data.pageInfo.hasNextPage || !data.pageInfo.endCursor) return { orders, hasMore: false };
    cursor = data.pageInfo.endCursor;
  }
  return { orders, hasMore: true, next: { after: cursor } };
}

// --------------------------------------------------------------------------
// WooCommerce
// --------------------------------------------------------------------------

export interface WooOrder {
  id: number;
  number?: string;
  status: string;
  currency: string;
  date_created_gmt?: string;
  date_created?: string;
  /** Laatste wijziging van de order (ook: een terugbetaling). */
  date_modified_gmt?: string | null;
  date_modified?: string | null;
  /** Gezet zodra de klant heeft betaald; leeg = nooit betaald. */
  date_paid_gmt?: string | null;
  date_paid?: string | null;
  total: string;
  total_tax: string;
  shipping_total?: string;
  shipping?: { country?: string };
  billing?: { country?: string; company?: string };
  refunds?: { id: number; total: string }[];
}

const WOO_SKIP = new Set(["pending", "failed", "cancelled", "checkout-draft", "trash"]);

/**
 * WooCommerce-order → verkoop + retouren. Geannuleerd, mislukt, in afwachting
 * of in de prullenbak telt alleen niet mee (`cancelled`) als er nooit is
 * betaald (geen date_paid). Zo'n order slaan we alleen op als er al een rij
 * voor is (`onlyIfKnown`): een mislukte of afgebroken checkout hoort niet in
 * de tabel. Is er wel betaald, dan blijft de verkoop staan, met eventuele
 * terugstortingen als retour (zie mapShopifyOrder): over ontvangen geld is
 * btw verschuldigd zolang het niet is terugbetaald.
 *
 * Datum van een retour: WooCommerce geeft in de order geen datum per
 * terugbetaling. We nemen de laatste wijziging van de order (een
 * terugbetaling wijzigt de order), nooit eerder dan de verkoop. Zo komt een
 * terugbetaling in K4 op een order uit K3 in K4, en verandert K3 niet
 * achteraf. Is de order na de terugbetaling nog eens gewijzigd voordat we
 * hem zagen, dan valt de retour later dan echt: de btw is dan eerder
 * betaald, niet te laat. Een opgeslagen retour houdt zijn datum
 * (`keepStoredDate`). Zonder wijzigingsdatum: de verkoopdatum, zoals eerst.
 */
export function mapWooOrder(o: WooOrder): NormalizedOrder[] {
  const gross = num(o.total);
  const vat = num(o.total_tax);
  const created = o.date_created_gmt ? `${o.date_created_gmt}Z` : o.date_created ?? new Date().toISOString();
  const sale: NormalizedOrder = {
    externalId: String(o.id),
    orderNumber: o.number ?? String(o.id),
    kind: "SALE",
    orderDate: isoDay(created),
    country: (o.shipping?.country || o.billing?.country || "").toUpperCase() || null,
    currency: o.currency || "EUR",
    totalGross: round2(gross),
    vatAmount: round2(vat),
    shippingGross: round2(num(o.shipping_total)),
    fees: 0,
    isBusiness: !!o.billing?.company && vat === 0 && gross > 0,
  };
  // WooCommerce geeft retourbedragen negatief ("-10.00") zonder eigen datum.
  const modified = o.date_modified_gmt ? `${o.date_modified_gmt}Z` : o.date_modified;
  const modifiedDay = modified && !Number.isNaN(Date.parse(modified)) ? isoDay(modified) : null;
  const refundDay = modifiedDay && modifiedDay > sale.orderDate ? modifiedDay : sale.orderDate;
  const refunds = (o.refunds ?? []).map((r): NormalizedOrder => {
    const amount = Math.abs(num(r.total));
    const share = gross > 0 ? Math.min(amount / gross, 1) : 0;
    return { ...sale, externalId: `${o.id}:refund:${r.id}`, kind: "REFUND", orderDate: refundDay, keepStoredDate: true, totalGross: round2(amount), vatAmount: round2(vat * share), shippingGross: 0 };
  });
  const paidRefunds = refunds.filter((r) => r.totalGross > 0);
  const paid = !!(o.date_paid_gmt || o.date_paid);
  if (WOO_SKIP.has(o.status) && paidRefunds.length === 0 && !paid) return [{ ...sale, cancelled: true, onlyIfKnown: true }];
  return [sale, ...paidRefunds];
}

/**
 * WooCommerce kent geen cursor: we bladeren per pagina (oudste eerst) door de
 * orders die sinds `since` zijn gewijzigd, en onthouden de volgende pagina.
 * - Nieuwe of net gewijzigde orders schuiven de lijst naar achteren: dan
 *   halen we hooguit een order twee keer op (geen probleem, we ontdubbelen).
 * - Verdwijnt er tussen twee rondes een order vóór de plek waar we waren
 *   (prullenbak, verwijderd), dan schuift de lijst naar voren. Daarom begint
 *   een voortgezette ronde één pagina terug: zo valt er niets weg zolang er
 *   tussen twee rondes minder dan 100 orders verdwijnen.
 * Wat tijdens het doorlopen wijzigt, komt mee in de sync daarna, want die
 * begint bij het begin van deze doorloop.
 */
export async function fetchWooOrders(siteUrl: string, creds: WooCredentials, since: Date, startPage = 1): Promise<FetchResult> {
  const base = normalizeShopUrl(siteUrl);
  await assertPublicHost(base.hostname);
  const auth = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");
  const orders: NormalizedOrder[] = [];
  // Eén pagina overlap bij voortzetten (zie hierboven).
  const first = Math.max(1, startPage - 1);
  for (let page = first; page < first + MAX_PAGES; page++) {
    const url = new URL(`${base.toString().replace(/\/$/, "")}/wp-json/wc/v3/orders`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("modified_after", since.toISOString()); // ook gewijzigde orders (retouren)
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "asc");
    const res = await guardedFetch(url.toString(), { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
    if (res.status === 401 || res.status === 403) throw new HttpError(422, "WooCommerce accepteert deze sleutels niet. Maak een REST-sleutel met leesrechten aan.");
    if (res.status === 404) throw new HttpError(422, "Op dit adres vinden we geen WooCommerce. Controleer het adres en of 'mooie permalinks' aan staan.");
    if (!res.ok) throw new HttpError(502, "WooCommerce gaf een foutmelding. Probeer het later opnieuw.");
    const list = (await res.json()) as WooOrder[];
    if (!Array.isArray(list)) throw new HttpError(502, "WooCommerce gaf een onverwacht antwoord.");
    for (const o of list) orders.push(...mapWooOrder(o));
    const totalPages = Number(res.headers.get("x-wp-totalpages") ?? 1);
    if (page >= totalPages || list.length < 100) return { orders, hasMore: false };
  }
  return { orders, hasMore: true, next: { page: first + MAX_PAGES } };
}

// --------------------------------------------------------------------------
// Bol.com
// --------------------------------------------------------------------------

export interface BolOrderDetail {
  orderId: string;
  orderPlacedDateTime: string;
  shipmentDetails?: { countryCode?: string; company?: string | null };
  billingDetails?: { countryCode?: string; company?: string | null; vatNumber?: string | null };
  orderItems: { orderItemId: string; quantity: number; unitPrice: number; cancellationRequest?: boolean; quantityCancelled?: number }[];
}

/**
 * Bol-prijzen zijn incl. btw; btw rekenen we terug met het tarief van het
 * afleverland. Geannuleerde stuks tellen niet mee; is alles geannuleerd, dan
 * krijgt de bestelling `cancelled` (zodat een eerder opgeslagen verkoop vervalt).
 */
export function mapBolOrder(o: BolOrderDetail): NormalizedOrder[] {
  const country = (o.shipmentDetails?.countryCode || o.billingDetails?.countryCode || "NL").toUpperCase();
  const gross = o.orderItems.reduce((s, i) => s + i.unitPrice * Math.max(0, i.quantity - (i.quantityCancelled ?? 0)), 0);
  if (gross <= 0) {
    return [{
      externalId: o.orderId, orderNumber: o.orderId, kind: "SALE", orderDate: isoDay(o.orderPlacedDateTime),
      country, currency: "EUR", totalGross: 0, vatAmount: 0, shippingGross: 0, fees: 0,
      isBusiness: !!o.billingDetails?.vatNumber, cancelled: true,
    }];
  }
  const isBusiness = !!o.billingDetails?.vatNumber;
  const rate = isBusiness ? 0 : (EU_STANDARD_VAT[country] ?? 21);
  const vat = gross - gross / (1 + rate / 100);
  return [{
    externalId: o.orderId,
    orderNumber: o.orderId,
    kind: "SALE",
    orderDate: isoDay(o.orderPlacedDateTime),
    country,
    currency: "EUR",
    totalGross: round2(gross),
    vatAmount: round2(vat),
    shippingGross: 0,
    fees: 0,
    isBusiness,
  }];
}

const BOL_ACCEPT = "application/vnd.retailer.v10+json";

async function bolToken(creds: BolCredentials): Promise<string> {
  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await guardedFetch("https://login.bol.com/token?grant_type=client_credentials", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (res.status === 400 || res.status === 401) throw new HttpError(422, "Bol.com accepteert deze client-id of secret niet. Controleer ze in je verkoopaccount (Instellingen → API-instellingen).");
  if (!res.ok) throw new HttpError(502, "Bol.com gaf een foutmelding bij het inloggen. Probeer het later opnieuw.");
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new HttpError(502, "Bol.com gaf geen toegangstoken terug.");
  return body.access_token;
}

/** Per ronde maximaal zoveel orderdetails (Bol beperkt het aantal verzoeken). */
export const BOL_DETAIL_BUDGET = 50;
/**
 * Per ronde in elk geval zoveel bekende orders opnieuw opvragen
 * (annuleringen), vóór het bladeren. Blijft er na het bladeren budget over,
 * dan controleren we er meer (tot BOL_DETAIL_BUDGET in totaal).
 */
export const BOL_RECHECK_MAX = 20;

/** Een order zoals de Bol-lijst hem geeft (de stuks-velden zijn niet altijd gevuld). */
interface BolListOrder {
  orderId: string;
  orderPlacedDateTime: string;
  orderItems?: { quantityCancelled?: number; cancellationRequest?: boolean }[];
}

/** Ziet de lijst zelf al een (verzoek tot) annulering bij deze order? */
const listShowsCancellation = (o: BolListOrder) =>
  (o.orderItems ?? []).some((i) => (i.quantityCancelled ?? 0) > 0 || i.cancellationRequest === true);

export interface BolFetchOptions {
  /**
   * Bekende orders die we NIET op grond van de lijst opnieuw opvragen: al
   * helemaal geannuleerd, of net nog gecontroleerd.
   */
  settled?: ReadonlySet<string>;
}

/**
 * @param known order-id's die we al hebben: die slaan we bij het bladeren over,
 *   behalve als de lijst bij zo'n order een annulering laat zien (en hij niet
 *   in `settled` staat): dan vragen we hem opnieuw op.
 * @param startPage pagina waar een onderbroken sync verdergaat.
 * @param recheck bekende orders die we opnieuw moeten controleren (recent en
 *   al een tijd niet bekeken, oudste controle eerst). De eerste
 *   BOL_RECHECK_MAX doen we in ELKE ronde, vóór het bladeren, met een eigen
 *   deel van het budget. Is het bladeren klaar en is er budget over, dan
 *   nemen we er meer uit deze lijst. Zo komen latere annuleringen ook binnen
 *   bij een winkel waarvan de lijst niet in één ronde past, of die per sync
 *   50 of meer nieuwe orders heeft.
 */
export async function fetchBolOrders(
  creds: BolCredentials,
  since: Date,
  known: ReadonlySet<string> = new Set(),
  startPage = 1,
  recheck: readonly string[] = [],
  options: BolFetchOptions = {},
): Promise<FetchResult> {
  const token = await bolToken(creds);
  const headers = { Authorization: `Bearer ${token}`, Accept: BOL_ACCEPT };
  const orders: NormalizedOrder[] = [];
  const checked: string[] = [];
  const checkedSet = new Set<string>();
  const settled = options.settled ?? new Set<string>();
  // De lijst geeft alleen ids; details (prijzen, land) per order.
  let detailBudget = BOL_DETAIL_BUDGET;
  const detail = async (orderId: string): Promise<"ok" | "limit"> => {
    const d = await guardedFetch(`https://api.bol.com/retailer/orders/${encodeURIComponent(orderId)}`, { headers });
    if (d.status === 429) return "limit";
    if (d.ok) orders.push(...mapBolOrder((await d.json()) as BolOrderDetail));
    return "ok";
  };
  /** Een bekende order opnieuw opvragen; false bij de limiet van Bol. */
  const recheckOne = async (id: string): Promise<boolean> => {
    if ((await detail(id)) === "limit") return false;
    checked.push(id);
    checkedSet.add(id);
    detailBudget--;
    return true;
  };
  const done = (r: Pick<FetchResult, "hasMore" | "next">): FetchResult => ({ orders, checked, ...r });

  // 1. Bekende orders opnieuw controleren, vóór het bladeren.
  let limited = false;
  for (const id of recheck.slice(0, BOL_RECHECK_MAX)) {
    // Bij de limiet stoppen we met controleren; het bladeren hieronder merkt
    // de limiet zelf en onthoudt dan de plek.
    if (!(await recheckOne(id))) { limited = true; break; }
  }

  // 2. Nieuwe orders. Eén pagina terug beginnen: schuift de lijst iets op,
  // dan missen we niets (bekende orders slaan we zonder extra verzoek over).
  const first = Math.max(1, startPage - 1);
  let finished = false;
  for (let page = first; page < first + MAX_PAGES; page++) {
    const res = await guardedFetch(`https://api.bol.com/retailer/orders?status=ALL&fulfilment-method=ALL&page=${page}`, { headers });
    if (res.status === 401 || res.status === 403) throw new HttpError(422, "Bol.com geeft geen toegang tot bestellingen met deze sleutels.");
    if (res.status === 429) return done({ hasMore: true, next: { page } });
    if (!res.ok) throw new HttpError(502, "Bol.com gaf een foutmelding. Probeer het later opnieuw.");
    const body = (await res.json()) as { orders?: BolListOrder[] };
    const list = body.orders ?? [];
    for (const item of list) {
      if (known.has(item.orderId)) {
        // Bekend, maar de lijst laat een annulering zien: nu meteen nakijken.
        if (!listShowsCancellation(item) || settled.has(item.orderId) || checkedSet.has(item.orderId)) continue;
        if (detailBudget <= 0) return done({ hasMore: true, next: { page } });
        if (!(await recheckOne(item.orderId))) return done({ hasMore: true, next: { page } });
        continue;
      }
      if (new Date(item.orderPlacedDateTime) < since) continue;
      if (detailBudget-- <= 0) return done({ hasMore: true, next: { page } });
      if ((await detail(item.orderId)) === "limit") return done({ hasMore: true, next: { page } });
    }
    if (list.length < 50) { finished = true; break; }
  }
  if (!finished) return done({ hasMore: true, next: { page: first + MAX_PAGES } });

  // 3. Klaar met bladeren en nog budget over: meer bekende orders nakijken.
  if (!limited) {
    for (const id of recheck.slice(BOL_RECHECK_MAX)) {
      if (detailBudget <= 0) break;
      if (checkedSet.has(id)) continue;
      if (!(await recheckOne(id))) break;
    }
  }
  return done({ hasMore: false });
}
