import type { WebshopConnection } from "@prisma/client";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import { HttpError } from "@/lib/http-error";
import { assertCan, type PermissionUser } from "@/lib/permissions";
import { logAccount, logAccountMany } from "@/lib/audit";
import { planHasFeature } from "@/lib/plans";
import { effectivePlanFor } from "@/lib/subscription";
import type { NormalizedOrder } from "./types";
import {
  describeNewOrder,
  describeOrderChange,
  newRowsInPastQuarters,
  orderRowData,
  orderUpdate,
  pastQuartersOf,
  syncStateAfter,
  syncWindow,
  type NewOrderRow,
  type OrderChange,
  type Quarter,
} from "./sync";
import {
  fetchBolOrders,
  fetchShopifyOrders,
  fetchWooOrders,
  BOL_DETAIL_BUDGET,
  type BolCredentials,
  type FetchResult,
  type ShopifyCredentials,
  type WooCredentials,
} from "./providers";

/** Financiële rechten + een plan met webshopkoppelingen (Webshop of Business). */
export async function requireWebshopAccess(user: PermissionUser): Promise<void> {
  assertCan(user, "financials");
  if (!planHasFeature(await effectivePlanFor(user.accountId), "webshopIntegrations")) {
    throw new HttpError(403, "Webshopkoppelingen zitten in het Webshop-pakket. Upgrade via Instellingen → Abonnement.");
  }
}

export async function hasWebshopPlan(accountId: string): Promise<boolean> {
  return planHasFeature(await effectivePlanFor(accountId), "webshopIntegrations");
}

/**
 * CSV-import: sla orders op; bestaande (zelfde koppeling + extern id) worden
 * overgeslagen. Bewust NIET bijwerken: een CSV zonder order-id krijgt een
 * id op regelnummer, en dan zou een ander bestand een andere order overschrijven.
 */
export async function storeOrders(userId: string, connectionId: string, orders: NormalizedOrder[]): Promise<number> {
  if (!orders.length) return 0;
  const now = new Date();
  let created = 0;
  // In blokken, zodat één grote import de database niet in één keer belast.
  for (let i = 0; i < orders.length; i += 500) {
    const chunk = orders.slice(i, i + 500);
    const result = await db.webshopOrder.createMany({
      data: chunk.map((o) => ({ userId, connectionId, ...orderRowData(o, now) })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
}

export interface UpsertResult {
  /** Nieuwe bestellingen die meetellen (geannuleerde nieuwe rijen niet). */
  created: number;
  updated: number;
  /** Wat er aan bestaande orders veranderde (oude rij + nieuwe velden). */
  changes: OrderChange[];
  /** De nieuw opgeslagen rijen, ook geannuleerde. */
  added: NewOrderRow[];
}

/**
 * Platformkoppelingen: nieuwe orders toevoegen en bekende orders bijwerken als
 * het platform ze anders teruggeeft (bedrag aangepast, geannuleerd, toch
 * doorgegaan). Elke order die we terugzien krijgt checkedAt = nu.
 * Een nieuwe order met `onlyIfKnown` (bijv. een mislukte WooCommerce-checkout)
 * slaan we niet op. Geeft ook terug WAT er veranderde en welke rijen nieuw
 * zijn, voor het logboek en de melding over afgelopen kwartalen.
 */
export async function upsertOrders(
  userId: string,
  connectionId: string,
  orders: NormalizedOrder[],
): Promise<UpsertResult> {
  let created = 0;
  let updated = 0;
  const changes: OrderChange[] = [];
  const added: NewOrderRow[] = [];
  if (!orders.length) return { created, updated, changes, added };
  const now = new Date();
  // Dezelfde order kan twee keer in één ophaalronde zitten (cursor schoof op): de laatste telt.
  const byId = new Map<string, NormalizedOrder>();
  for (const o of orders) byId.set(o.externalId.slice(0, 190), o);
  const list = [...byId.values()];
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const ids = chunk.map((o) => o.externalId.slice(0, 190));
    const existing = await db.webshopOrder.findMany({
      where: { connectionId, externalId: { in: ids } },
      select: {
        id: true, externalId: true, kind: true, orderNumber: true, orderDate: true, country: true, currency: true,
        totalGross: true, vatAmount: true, shippingGross: true, fees: true, isBusiness: true, cancelledAt: true,
      },
    });
    const known = new Map(existing.map((e) => [e.externalId, e]));
    const fresh = chunk.filter((o) => !known.has(o.externalId.slice(0, 190)) && !o.onlyIfKnown);
    if (fresh.length) {
      const rows = fresh.map((o) => orderRowData(o, now));
      const result = await db.webshopOrder.createMany({
        data: rows.map((r) => ({ userId, connectionId, ...r, checkedAt: now })),
        skipDuplicates: true,
      });
      // Alleen wat meetelt heet "nieuw opgehaald". (Bij een gelijktijdige
      // sync kan createMany minder rijen maken dan we aanboden; die rijen
      // zijn dan door de andere sync gemaakt en gemeld.)
      const counting = rows.filter((r) => !r.cancelledAt).length;
      created += Math.min(counting, result.count);
      if (result.count === rows.length) added.push(...rows);
    }
    const unchanged: string[] = [];
    for (const o of chunk) {
      const row = known.get(o.externalId.slice(0, 190));
      if (!row) continue;
      const data = orderUpdate(row, o, now);
      if (!data) { unchanged.push(row.id); continue; }
      await db.webshopOrder.update({ where: { id: row.id }, data: { ...data, checkedAt: now } });
      changes.push({ externalId: row.externalId, kind: row.kind, before: row, data });
      updated++;
    }
    if (unchanged.length) await db.webshopOrder.updateMany({ where: { id: { in: unchanged } }, data: { checkedAt: now } });
  }
  return { created, updated, changes, added };
}

/** Zoveel logregels per ronde over gewijzigde orders in afgelopen kwartalen; de rest samengevat. */
const AUDIT_MAX = 100;

type Actor = Parameters<typeof logAccount>[1];

/**
 * Wijzigingen in een kwartaal dat al voorbij is: per order een regel in het
 * activiteitenlogboek met de oude en de nieuwe waarde, en per nieuwe rij die
 * in zo'n kwartaal valt (nagekomen bestelling of retour) een regel met het
 * bedrag. Over zo'n kwartaal kan de btw- of OSS-aangifte al gedaan zijn.
 * We wachten op het schrijven: de melding aan de gebruiker verwijst naar
 * deze regels.
 */
async function logPastQuarterChanges(accountId: string, actor: Actor, shop: string, changes: OrderChange[], added: NewOrderRow[], now: Date): Promise<Quarter[]> {
  const late = newRowsInPastQuarters(added, now);
  const past = pastQuartersOf(changes, now, late);
  if (!past.length) return past;
  const hit = changes.filter((c) => pastQuartersOf([c], now).length > 0);
  const lines = [...hit.map((c) => describeOrderChange(c, shop)), ...late.map((r) => describeNewOrder(r, shop))];
  const targets = lines.slice(0, AUDIT_MAX);
  if (lines.length > AUDIT_MAX) targets.push(`${shop} — en nog ${lines.length - AUDIT_MAX} gewijzigde of nagekomen bestellingen in afgelopen kwartalen`);
  await logAccountMany(accountId, actor, "webshop.order_changed", targets);
  return past;
}

/** Bol.com: bekende orders van de laatste zoveel dagen opnieuw controleren op (deel)annuleringen. */
export const BOL_RECHECK_DAYS = 30;
/** ... maar niet vaker dan eens per zoveel uur per order. */
const BOL_RECHECK_HOURS = 12;

/**
 * Bol-orders die aan de beurt zijn voor een nieuwe controle: recent, niet al
 * helemaal geannuleerd (dat kan bij Bol niet meer terug) en een tijd niet bekeken.
 */
function bolDueWhere(connectionId: string, now: Date) {
  return {
    connectionId,
    kind: "SALE" as const,
    cancelledAt: null,
    orderDate: { gte: new Date(now.getTime() - BOL_RECHECK_DAYS * 86_400_000) },
    OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(now.getTime() - BOL_RECHECK_HOURS * 3_600_000) } }],
  };
}

type Creds = ShopifyCredentials | WooCredentials | BolCredentials;

export function sealCredentials(creds: Creds): string {
  const sealed = encrypt(JSON.stringify(creds));
  if (!sealed) throw new HttpError(500, "Sleutels konden niet veilig worden opgeslagen.");
  return sealed;
}

function openCredentials<T extends Creds>(conn: Pick<WebshopConnection, "credentials">): T {
  const raw = decrypt(conn.credentials);
  if (!raw) throw new HttpError(409, "Deze koppeling heeft geen sleutels meer. Koppel de winkel opnieuw.");
  return JSON.parse(raw) as T;
}

export interface ConnectionFetch extends FetchResult {
  /** Op te slaan op de koppeling: lastSyncAt en syncCursor (lib/webshop/sync.ts). */
  state: { lastSyncAt: Date | null; syncCursor: string | null };
  /** Deze ronde begon de eenmalige inhaalronde (zie syncWindow). */
  catchUp: boolean;
}

/** Haal orders op bij het platform (zonder op te slaan). */
export async function fetchForConnection(
  conn: Pick<WebshopConnection, "id" | "platform" | "shopUrl" | "credentials" | "lastSyncAt" | "syncCursor"> &
    Partial<Pick<WebshopConnection, "lastRunAt" | "createdAt">>,
  creds?: Creds,
): Promise<ConnectionFetch> {
  // Onderbroken sync: precies daar verder. Anders vanaf lastSyncAt min twee
  // dagen overlap (of de eerste 120 dagen; of eenmalig alles opnieuw voor
  // een koppeling van vóór de herstelde voortgang).
  const now = new Date();
  const window = syncWindow(conn, now);
  const { since, resume } = window;
  let result: FetchResult;
  switch (conn.platform) {
    case "SHOPIFY":
      result = await fetchShopifyOrders(conn.shopUrl ?? "", (creds as ShopifyCredentials) ?? openCredentials<ShopifyCredentials>(conn), since, resume?.after ?? null);
      break;
    case "WOOCOMMERCE":
      result = await fetchWooOrders(conn.shopUrl ?? "", (creds as WooCredentials) ?? openCredentials<WooCredentials>(conn), since, resume?.page ?? 1);
      break;
    case "BOLCOM": {
      const checkedBefore = new Date(now.getTime() - BOL_RECHECK_HOURS * 3_600_000);
      // Bekend = overslaan bij het bladeren (alleen orders binnen het venster zijn nodig).
      const known = await db.webshopOrder.findMany({
        // orderDate is een dag (00:00 UTC): een dag ruimer, zodat een order van de eerste dag ook als bekend telt.
        where: { connectionId: conn.id, orderDate: { gte: new Date(since.getTime() - 86_400_000) } },
        select: { externalId: true, cancelledAt: true, checkedAt: true },
      });
      // Opnieuw controleren: los van het bladeren, in elke ronde, de orders
      // die het langst niet zijn bekeken. Na de ronde krijgen ze checkedAt,
      // dus de volgende ronde neemt de volgende. Volledig geannuleerd kan bij
      // Bol niet meer terug, die slaan we over. We halen er genoeg op voor
      // het hele budget: blijft er na het bladeren ruimte, dan gaan we door.
      const due = await db.webshopOrder.findMany({
        where: bolDueWhere(conn.id, now),
        orderBy: [{ checkedAt: { sort: "asc", nulls: "first" } }, { orderDate: "desc" }],
        take: BOL_DETAIL_BUDGET,
        select: { externalId: true },
      });
      // Laat de lijst een annulering zien bij een bekende order, dan vragen we
      // hem meteen op; behalve als hij al helemaal geannuleerd is of net is bekeken.
      const settled = new Set(known.filter((k) => k.cancelledAt || (k.checkedAt && k.checkedAt >= checkedBefore)).map((k) => k.externalId));
      result = await fetchBolOrders(
        (creds as BolCredentials) ?? openCredentials<BolCredentials>(conn),
        since,
        new Set(known.map((k) => k.externalId)),
        resume?.page ?? 1,
        due.map((d) => d.externalId),
        { settled },
      );
      break;
    }
    default:
      throw new HttpError(400, "Een CSV-import synchroniseer je door een nieuw bestand te uploaden.");
  }
  return { ...result, state: syncStateAfter(conn.lastSyncAt, window, result), catchUp: window.catchUp };
}

export interface SyncOutcome {
  imported: number;
  updated: number;
  hasMore: boolean;
  /**
   * Afgelopen kwartalen waarin een bestaande bestelling is veranderd, of
   * waarin een nagekomen bestelling of retour valt.
   */
  pastQuarters: Quarter[];
  /** Deze ronde begon de eenmalige inhaalronde over de hele periode. */
  catchUp: boolean;
  /**
   * Bol.com: zoveel bestellingen van de laatste 30 dagen wachten nog op een
   * nieuwe controle op annuleringen. 0 bij de andere platforms.
   */
  recheckBacklog: number;
}

/** Synchroniseer een bestaande koppeling en werk de status bij. */
export async function syncConnection(conn: WebshopConnection, actor: Actor = {}): Promise<SyncOutcome> {
  try {
    const result = await fetchForConnection(conn);
    const { created, updated, changes, added } = await upsertOrders(conn.userId, conn.id, result.orders);
    const now = new Date();
    // Bol: ook opnieuw opgevraagde orders die Bol niet (meer) gaf als bekeken markeren.
    if (result.checked?.length) {
      await db.webshopOrder.updateMany({ where: { connectionId: conn.id, externalId: { in: result.checked } }, data: { checkedAt: now } });
    }
    const recheckBacklog = conn.platform === "BOLCOM" ? await db.webshopOrder.count({ where: bolDueWhere(conn.id, now) }) : 0;
    // Nieuwe rijen in een afgelopen kwartaal melden we pas na de eerste
    // volledige doorloop (lastSyncAt staat): bij de eerste import is oude
    // geschiedenis gewoon de bedoeling.
    const late = conn.lastSyncAt ? added : [];
    const pastQuarters = await logPastQuarterChanges(conn.userId, actor, conn.name, changes, late, now);
    // Voortgang = de plek bij het platform (cursor/pagina), nooit een
    // orderdatum: zo vallen er geen bestellingen weg (lib/webshop/sync.ts).
    // lastRunAt = nu: voor de weergave en de rem, los van het venster.
    await db.webshopConnection.update({
      where: { id: conn.id },
      data: { status: "ACTIVE", lastError: null, lastSyncAt: result.state.lastSyncAt, syncCursor: result.state.syncCursor, lastRunAt: now },
    });
    return { imported: created, updated, hasMore: result.hasMore, pastQuarters, catchUp: result.catchUp, recheckBacklog };
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "Synchroniseren is mislukt. Probeer het later opnieuw.";
    await db.webshopConnection.update({ where: { id: conn.id }, data: { status: "ERROR", lastError: message.slice(0, 300) } });
    throw err;
  }
}
