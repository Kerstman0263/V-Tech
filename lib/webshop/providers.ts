import { HttpError } from "@/lib/http-error";
import { round2, type NormalizedOrder } from "./types";
import { EU_STANDARD_VAT } from "./oss";
import { assertPublicHost, guardedFetch, normalizeShopUrl, normalizeShopifyDomain } from "./safe-url";

/**
 * Koppelingen met de webshopplatforms. Alle verzoeken zijn ALLEEN-LEZEN.
 *
 * - Shopify: Admin GraphQL API met een Admin-API-token van een eigen app
 *   (Instellingen → Apps → App ontwikkelen; scope read_orders).
 * - WooCommerce: REST API v3 met een consumer key/secret (alleen lezen).
 * - Bol.com: Retailer API v10 met client-id/secret (OAuth client credentials).
 *
 * Elke sync haalt maximaal MAX_PAGES pagina's op, zodat een serverless
 * functie niet over zijn tijdslimiet gaat; de volgende sync gaat verder
 * vanaf de laatst opgehaalde datum.
 */

export const MAX_PAGES = 8;
/** Bij de eerste sync halen we zoveel dagen terug op. */
export const FIRST_SYNC_DAYS = 120;
/** Shopify API-versie: kwartaalversies, ± 12 maanden ondersteund. Jaarlijks ophogen. */
export const SHOPIFY_API_VERSION = "2026-07";

export interface ShopifyCredentials { accessToken: string }
export interface WooCredentials { consumerKey: string; consumerSecret: string }
export interface BolCredentials { clientId: string; clientSecret: string }

export interface FetchResult {
  orders: NormalizedOrder[];
  /** true als er meer was dan we in één keer ophaalden. */
  hasMore: boolean;
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
}

/** Shopify-order (GraphQL) → genormaliseerde verkoop + eventuele retouren. */
export function mapShopifyOrder(o: ShopifyOrderNode): NormalizedOrder[] {
  if (o.cancelledAt) return [];
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
  return [sale, ...refunds];
}

const SHOPIFY_QUERY = `query Orders($cursor: String, $query: String) {
  orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt currencyCode cancelledAt
      totalPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      shippingAddress { countryCodeV2 }
      billingAddress { countryCodeV2 company }
      refunds { id createdAt totalRefundedSet { shopMoney { amount } } }
    }
  }
}`;

async function shopifyRequest(domain: string, token: string, variables: Record<string, unknown>) {
  const res = await guardedFetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: SHOPIFY_QUERY, variables }),
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(422, "Shopify accepteert dit token niet. Controleer het token en of de app de rechten read_orders heeft.");
  if (res.status === 404) throw new HttpError(422, "Deze Shopify-winkel bestaat niet. Controleer het adres (mijnwinkel.myshopify.com).");
  if (!res.ok) throw new HttpError(502, "Shopify gaf een foutmelding. Probeer het later opnieuw.");
  const body = (await res.json()) as { data?: { orders?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrderNode[] } }; errors?: unknown };
  if (!body.data?.orders) throw new HttpError(422, "Shopify gaf geen bestellingen terug. Heeft de app de rechten read_orders?");
  return body.data.orders;
}

export async function fetchShopifyOrders(shop: string, creds: ShopifyCredentials, since: Date): Promise<FetchResult> {
  const domain = normalizeShopifyDomain(shop);
  // updated_at i.p.v. created_at: zo komen ook retouren op oudere orders mee.
  const query = `updated_at:>=${since.toISOString().slice(0, 10)}`;
  const orders: NormalizedOrder[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await shopifyRequest(domain, creds.accessToken, { cursor, query });
    for (const node of data.nodes) orders.push(...mapShopifyOrder(node));
    if (!data.pageInfo.hasNextPage) return { orders, hasMore: false };
    cursor = data.pageInfo.endCursor;
  }
  return { orders, hasMore: true };
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
  total: string;
  total_tax: string;
  shipping_total?: string;
  shipping?: { country?: string };
  billing?: { country?: string; company?: string };
  refunds?: { id: number; total: string }[];
}

const WOO_SKIP = new Set(["pending", "failed", "cancelled", "checkout-draft", "trash"]);

export function mapWooOrder(o: WooOrder): NormalizedOrder[] {
  if (WOO_SKIP.has(o.status)) return [];
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
  const refunds = (o.refunds ?? []).map((r): NormalizedOrder => {
    const amount = Math.abs(num(r.total));
    const share = gross > 0 ? Math.min(amount / gross, 1) : 0;
    return { ...sale, externalId: `${o.id}:refund:${r.id}`, kind: "REFUND", totalGross: round2(amount), vatAmount: round2(vat * share), shippingGross: 0 };
  });
  return [sale, ...refunds.filter((r) => r.totalGross > 0)];
}

export async function fetchWooOrders(siteUrl: string, creds: WooCredentials, since: Date): Promise<FetchResult> {
  const base = normalizeShopUrl(siteUrl);
  await assertPublicHost(base.hostname);
  const auth = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");
  const orders: NormalizedOrder[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
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
  return { orders, hasMore: true };
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

/** Bol-prijzen zijn incl. btw; btw rekenen we terug met het tarief van het afleverland. */
export function mapBolOrder(o: BolOrderDetail): NormalizedOrder[] {
  const country = (o.shipmentDetails?.countryCode || o.billingDetails?.countryCode || "NL").toUpperCase();
  const gross = o.orderItems.reduce((s, i) => s + i.unitPrice * Math.max(0, i.quantity - (i.quantityCancelled ?? 0)), 0);
  if (gross <= 0) return [];
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

export async function fetchBolOrders(creds: BolCredentials, since: Date, knownIds: Set<string> = new Set()): Promise<FetchResult> {
  const token = await bolToken(creds);
  const headers = { Authorization: `Bearer ${token}`, Accept: BOL_ACCEPT };
  const orders: NormalizedOrder[] = [];
  // De lijst geeft alleen ids; details (prijzen, land) per order. Bol beperkt
  // het aantal verzoeken, dus per sync maximaal 50 nieuwe details.
  let detailBudget = 50;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await guardedFetch(`https://api.bol.com/retailer/orders?status=ALL&fulfilment-method=ALL&page=${page}`, { headers });
    if (res.status === 401 || res.status === 403) throw new HttpError(422, "Bol.com geeft geen toegang tot bestellingen met deze sleutels.");
    if (res.status === 429) return { orders, hasMore: true };
    if (!res.ok) throw new HttpError(502, "Bol.com gaf een foutmelding. Probeer het later opnieuw.");
    const body = (await res.json()) as { orders?: { orderId: string; orderPlacedDateTime: string }[] };
    const list = body.orders ?? [];
    for (const item of list) {
      if (knownIds.has(item.orderId) || new Date(item.orderPlacedDateTime) < since) continue;
      if (detailBudget-- <= 0) return { orders, hasMore: true };
      const d = await guardedFetch(`https://api.bol.com/retailer/orders/${encodeURIComponent(item.orderId)}`, { headers });
      if (d.status === 429) return { orders, hasMore: true };
      if (!d.ok) continue;
      orders.push(...mapBolOrder((await d.json()) as BolOrderDetail));
    }
    if (list.length < 50) return { orders, hasMore: false };
  }
  return { orders, hasMore: true };
}
