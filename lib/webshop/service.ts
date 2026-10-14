import type { WebshopConnection } from "@prisma/client";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import { HttpError } from "@/lib/http-error";
import { assertCan, type PermissionUser } from "@/lib/permissions";
import { planHasFeature } from "@/lib/plans";
import type { NormalizedOrder } from "./types";
import {
  FIRST_SYNC_DAYS,
  fetchBolOrders,
  fetchShopifyOrders,
  fetchWooOrders,
  type BolCredentials,
  type FetchResult,
  type ShopifyCredentials,
  type WooCredentials,
} from "./providers";

/** Financiële rechten + een plan met webshopkoppelingen (Webshop of Business). */
export async function requireWebshopAccess(user: PermissionUser): Promise<void> {
  assertCan(user, "financials");
  const sub = await db.subscription.findUnique({ where: { userId: user.accountId }, select: { plan: true } });
  if (!planHasFeature(sub?.plan ?? "FREE", "webshopIntegrations")) {
    throw new HttpError(403, "Webshopkoppelingen zitten in het Webshop-pakket. Upgrade via Instellingen → Abonnement.");
  }
}

export async function hasWebshopPlan(accountId: string): Promise<boolean> {
  const sub = await db.subscription.findUnique({ where: { userId: accountId }, select: { plan: true } });
  return planHasFeature(sub?.plan ?? "FREE", "webshopIntegrations");
}

/** Sla orders op; bestaande (zelfde koppeling + extern id) worden overgeslagen. */
export async function storeOrders(userId: string, connectionId: string, orders: NormalizedOrder[]): Promise<number> {
  if (!orders.length) return 0;
  let created = 0;
  // In blokken, zodat één grote import de database niet in één keer belast.
  for (let i = 0; i < orders.length; i += 500) {
    const chunk = orders.slice(i, i + 500);
    const result = await db.webshopOrder.createMany({
      data: chunk.map((o) => ({
        userId,
        connectionId,
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
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
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

/** Haal orders op bij het platform (zonder op te slaan). */
export async function fetchForConnection(
  conn: Pick<WebshopConnection, "id" | "platform" | "shopUrl" | "credentials" | "lastSyncAt">,
  creds?: Creds,
): Promise<FetchResult> {
  // Twee dagen overlap: orders die rond de vorige sync binnenkwamen niet missen.
  const since = conn.lastSyncAt
    ? new Date(conn.lastSyncAt.getTime() - 2 * 86_400_000)
    : new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000);
  switch (conn.platform) {
    case "SHOPIFY":
      return fetchShopifyOrders(conn.shopUrl ?? "", (creds as ShopifyCredentials) ?? openCredentials<ShopifyCredentials>(conn), since);
    case "WOOCOMMERCE":
      return fetchWooOrders(conn.shopUrl ?? "", (creds as WooCredentials) ?? openCredentials<WooCredentials>(conn), since);
    case "BOLCOM": {
      const known = await db.webshopOrder.findMany({
        where: { connectionId: conn.id, orderDate: { gte: since } },
        select: { externalId: true },
      });
      return fetchBolOrders((creds as BolCredentials) ?? openCredentials<BolCredentials>(conn), since, new Set(known.map((k) => k.externalId)));
    }
    default:
      throw new HttpError(400, "Een CSV-import synchroniseer je door een nieuw bestand te uploaden.");
  }
}

/** Synchroniseer een bestaande koppeling en werk de status bij. */
export async function syncConnection(conn: WebshopConnection): Promise<{ imported: number; hasMore: boolean }> {
  try {
    const result = await fetchForConnection(conn);
    const imported = await storeOrders(conn.userId, conn.id, result.orders);
    // Bij meer pagina's: niet tot "nu" vooruitzetten (dan slaan we orders over),
    // maar tot de nieuwste opgehaalde orderdatum, zodat de volgende sync verder gaat.
    const newest = result.orders.reduce<string | null>((max, o) => (!max || o.orderDate > max ? o.orderDate : max), null);
    const lastSyncAt = result.hasMore ? (newest ? new Date(`${newest}T00:00:00Z`) : conn.lastSyncAt) : new Date();
    await db.webshopConnection.update({ where: { id: conn.id }, data: { status: "ACTIVE", lastError: null, lastSyncAt } });
    return { imported, hasMore: result.hasMore };
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "Synchroniseren is mislukt. Probeer het later opnieuw.";
    await db.webshopConnection.update({ where: { id: conn.id }, data: { status: "ERROR", lastError: message.slice(0, 300) } });
    throw err;
  }
}
