import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pakket "Webshop-synchronisatie en bankimport" (nr 12, 38, 39).
 * Nep-database en nep-platforms: geen echte database of winkel nodig. De
 * nep-platforms filteren en sorteren zoals het echte platform (Shopify op
 * updated_at met een sleutel-cursor, WooCommerce op aanmaakdatum per pagina,
 * Bol.com nieuwste eerst per 50), zodat wijzigingen TUSSEN twee rondes echt
 * effect hebben.
 */

type Row = Record<string, unknown> & { id: string; connectionId: string; externalId: string };
const h = vi.hoisted(() => {
  const orders: Row[] = [];
  const connections = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const checkedMatch = (w: Record<string, unknown>, r: Row) => {
    if ("checkedAt" in w && w.checkedAt === null) return !r.checkedAt;
    const lt = (w.checkedAt as { lt?: Date } | undefined)?.lt;
    if (lt) return !!r.checkedAt && (r.checkedAt as Date) < lt;
    return true;
  };
  const pick = (where: Record<string, unknown>) => (r: Row) => {
    if (where.connectionId && r.connectionId !== where.connectionId) return false;
    if (where.kind && r.kind !== where.kind) return false;
    if ("cancelledAt" in where && where.cancelledAt === null && r.cancelledAt) return false;
    const ext = where.externalId as { in?: string[] } | undefined;
    if (ext?.in && !ext.in.includes(r.externalId)) return false;
    const ids = where.id as { in?: string[] } | undefined;
    if (ids?.in && !ids.in.includes(r.id)) return false;
    const date = where.orderDate as { gte?: Date } | undefined;
    if (date?.gte && (r.orderDate as Date) < date.gte) return false;
    const or = where.OR as Record<string, unknown>[] | undefined;
    if (or && !or.some((w) => checkedMatch(w, r))) return false;
    return true;
  };
  const time = (v: unknown) => (v instanceof Date ? v.getTime() : null);
  const db = {
    webshopOrder: {
      findMany: vi.fn(async ({ where, orderBy, take }: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => {
        let list = orders.filter(pick(where)).map((r) => ({ ...r }));
        if (Array.isArray(orderBy) && JSON.stringify(orderBy).includes("checkedAt")) {
          // checkedAt oplopend, leeg eerst; daarna nieuwste orderdatum eerst.
          list = list.sort((a, b) => {
            const ca = time(a.checkedAt) ?? -Infinity;
            const cb = time(b.checkedAt) ?? -Infinity;
            if (ca !== cb) return ca - cb;
            return (time(b.orderDate) ?? 0) - (time(a.orderDate) ?? 0);
          });
        }
        return typeof take === "number" ? list.slice(0, take) : list;
      }),
      createMany: vi.fn(async ({ data }: { data: Omit<Row, "id">[] }) => {
        let count = 0;
        for (const d of data) {
          if (orders.some((r) => r.connectionId === d.connectionId && r.externalId === d.externalId)) continue;
          orders.push({ ...d, id: `o${++seq}` } as Row);
          count++;
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = orders.find((o) => o.id === where.id)!;
        Object.assign(r, data);
        return r;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const list = orders.filter(pick(where));
        for (const r of list) Object.assign(r, data);
        return { count: list.length };
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => orders.filter(pick(where)).length),
    },
    webshopConnection: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const c = { ...(connections.get(where.id) ?? {}), ...data };
        connections.set(where.id, c);
        return c;
      }),
      findFirst: vi.fn(),
    },
    subscription: { findUnique: vi.fn(async () => ({ plan: "WEBSHOP" })) },
    auditLog: { create: vi.fn(async () => ({})), createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
    bankTransaction: { findMany: vi.fn(), createMany: vi.fn() },
    invoice: { findMany: vi.fn(async () => []) },
  };
  return { orders, connections, db, fetch: vi.fn(), session: { user: null as Record<string, unknown> | null } };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/auth", () => ({ auth: async () => (h.session.user ? { user: h.session.user } : null) }));
vi.mock("@/lib/encryption", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string | null) => (s?.startsWith("enc:") ? s.slice(4) : null),
}));
vi.mock("@/lib/webshop/safe-url", async (orig) => ({
  ...(await orig<typeof import("@/lib/webshop/safe-url")>()),
  guardedFetch: h.fetch,
  assertPublicHost: async () => undefined,
}));

import crypto from "node:crypto";
import type { WebshopConnection } from "@prisma/client";
import { mapBolOrder, mapShopifyOrder, mapWooOrder, type BolOrderDetail, type ShopifyOrderNode, type WooOrder } from "@/lib/webshop/providers";
import {
  currentQuarter,
  describeOrderChange,
  orderRowData,
  orderUpdate,
  parseSyncCursor,
  pastQuartersOf,
  syncStateAfter,
  syncWindow,
  FIRST_SYNC_DAYS,
} from "@/lib/webshop/sync";
import { syncConnection, upsertOrders } from "@/lib/webshop/service";
import { bankDedupeKeys, parseBankCsvRows } from "@/lib/bank-parse";
import { POST as bankImport } from "@/app/api/bank/import/route";
import { POST as syncRoute } from "@/app/api/webshop/connections/[id]/sync/route";

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });

const DAY = 86_400_000;

function conn(over: Partial<WebshopConnection> = {}): WebshopConnection {
  return {
    id: "c1", userId: "u1", platform: "SHOPIFY", name: "winkel.myshopify.com", shopUrl: "winkel.myshopify.com",
    credentials: `enc:${JSON.stringify({ accessToken: "shpat_test_123456" })}`, status: "ACTIVE",
    lastSyncAt: null, lastRunAt: null, lastError: null, syncCursor: null, createdAt: new Date(), updatedAt: new Date(0),
    ...over,
  } as WebshopConnection;
}

/** De koppeling zoals hij na de vorige ronde is opgeslagen. */
function saved(c: WebshopConnection): WebshopConnection {
  const s = h.connections.get(c.id) ?? {};
  return conn({ ...c, lastSyncAt: (s.lastSyncAt as Date | null) ?? null, syncCursor: (s.syncCursor as string | null) ?? null, lastRunAt: (s.lastRunAt as Date | null) ?? null });
}

beforeEach(() => {
  h.orders.length = 0;
  h.connections.clear();
  h.fetch.mockReset();
  for (const m of Object.values(h.db.webshopOrder)) m.mockClear();
  h.db.auditLog.create.mockClear();
  h.db.auditLog.createMany.mockClear();
});

// ---------------------------------------------------------------------------
// Nep-platforms
// ---------------------------------------------------------------------------

type FakeShopifyOrder = ShopifyOrderNode & { updatedAt: string };

/**
 * Nep-Shopify: filtert op `updated_at:>=` en sorteert op de sortKey uit de
 * query (UPDATED_AT of anders CREATED_AT), met een sleutel-cursor zoals de
 * echte API (sorteerwaarde + id). `store` mag tussen rondes veranderen.
 */
function fakeShopify(store: FakeShopifyOrder[]) {
  const requests: { filter: string; cursor: string | null }[] = [];
  const num = (o: FakeShopifyOrder) => Number(o.id.split("/").pop());
  const cmp = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];
  h.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { query: string; variables: { cursor: string | null; query: string } };
    requests.push({ filter: body.variables.query, cursor: body.variables.cursor });
    const byUpdated = /sortKey:\s*UPDATED_AT/.test(body.query);
    const m = /updated_at:>=(\d{4}-\d{2}-\d{2})/.exec(body.variables.query ?? "");
    const from = m ? Date.parse(`${m[1]}T00:00:00Z`) : -Infinity;
    const key = (o: FakeShopifyOrder): [number, number] => [Date.parse(byUpdated ? o.updatedAt : o.createdAt), num(o)];
    const sorted = store.filter((o) => Date.parse(o.updatedAt) >= from).sort((a, b) => cmp(key(a), key(b)));
    const after = body.variables.cursor ? (JSON.parse(body.variables.cursor) as [number, number]) : null;
    const rest = after ? sorted.filter((o) => cmp(key(o), after) > 0) : sorted;
    const page = rest.slice(0, 100);
    const last = page[page.length - 1];
    const nodes = page.map(({ updatedAt, ...n }) => n);
    return json({ data: { orders: { pageInfo: { hasNextPage: rest.length > 100, endCursor: last ? JSON.stringify(key(last)) : null }, nodes } } });
  });
  return requests;
}

type FakeWooOrder = WooOrder & { date_modified_gmt: string };

/**
 * Nep-WooCommerce: modified_after, orderby=date asc, 100 per pagina, prullenbak
 * telt niet mee. Geeft date_modified_gmt mee zoals de echte API (met
 * `hideModified` niet: voor de terugval op de verkoopdatum).
 */
function fakeWoo(store: FakeWooOrder[], opts: { hideModified?: boolean } = {}) {
  const pages: number[] = [];
  h.fetch.mockImplementation(async (url: string) => {
    const u = new URL(url);
    const page = Number(u.searchParams.get("page"));
    pages.push(page);
    const after = Date.parse(u.searchParams.get("modified_after") ?? "1970-01-01T00:00:00Z");
    const asc = u.searchParams.get("orderby") === "date" && u.searchParams.get("order") === "asc";
    const list = store
      .filter((o) => o.status !== "trash" && Date.parse(`${o.date_modified_gmt}Z`) > after)
      .sort((a, b) => (asc ? 1 : -1) * (Date.parse(`${a.date_created_gmt}Z`) - Date.parse(`${b.date_created_gmt}Z`) || a.id - b.id));
    const totalPages = Math.max(1, Math.ceil(list.length / 100));
    const out = list.slice((page - 1) * 100, page * 100).map(({ date_modified_gmt, ...o }) => (opts.hideModified ? o : { ...o, date_modified_gmt }));
    return json(out, { "x-wp-totalpages": String(totalPages) });
  });
  return pages;
}

const wooTime = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/** Nep-Bol: lijst nieuwste eerst, 50 per pagina; details per order; optioneel een 429. */
type BolListEntry = { orderId: string; placed: string; items?: { quantityCancelled?: number; cancellationRequest?: boolean }[] };
function fakeBol(list: BolListEntry[], details: Map<string, BolOrderDetail>, opts: { limitOnDetailCall?: number } = {}) {
  const listPages: number[] = [];
  const detailCalls: string[] = [];
  let calls = 0;
  h.fetch.mockImplementation(async (url: string) => {
    if (url.startsWith("https://login.bol.com")) return json({ access_token: "tok" });
    const u = new URL(url);
    if (u.pathname === "/retailer/orders") {
      const page = Number(u.searchParams.get("page"));
      listPages.push(page);
      const slice = list.slice((page - 1) * 50, page * 50).map((o) => ({ orderId: o.orderId, orderPlacedDateTime: o.placed, ...(o.items ? { orderItems: o.items } : {}) }));
      return json({ orders: slice });
    }
    calls++;
    if (opts.limitOnDetailCall && calls === opts.limitOnDetailCall) return new Response("{}", { status: 429 });
    const id = decodeURIComponent(u.pathname.split("/").pop()!);
    detailCalls.push(id);
    const d = details.get(id);
    return d ? json(d) : new Response("{}", { status: 404 });
  });
  return { listPages, detailCalls };
}

const bolDetail = (orderId: string, placed: string, cancelled = 0): BolOrderDetail => ({
  orderId, orderPlacedDateTime: placed, orderItems: [{ orderItemId: `${orderId}-1`, quantity: 1, unitPrice: 24.2, quantityCancelled: cancelled }],
});

const bolConn = (over: Partial<WebshopConnection> = {}) =>
  conn({ platform: "BOLCOM", name: "Bol.com", shopUrl: null, credentials: `enc:${JSON.stringify({ clientId: "client-123", clientSecret: "secret-123" })}`, ...over });

/** Een opgeslagen Bol-order zoals een eerdere sync hem achterliet. */
function storeBol(d: BolOrderDetail, checkedAt: Date | null, now = new Date()) {
  h.orders.push({ id: `db-${d.orderId}`, connectionId: "c1", userId: "u1", ...orderRowData(mapBolOrder(d)[0], now), checkedAt });
}

// ---------------------------------------------------------------------------
// nr 12: voortgang van de synchronisatie
// ---------------------------------------------------------------------------

describe("nr 12: Shopify-sync slaat geen bestellingen over", () => {
  function shopifyStore(total: number, now: number): FakeShopifyOrder[] {
    return Array.from({ length: total }, (_, i) => ({
      id: `gid://shopify/Order/${i + 1}`,
      name: `#${1001 + i}`,
      createdAt: new Date(now - 100 * DAY + i * 3_600_000).toISOString(),
      updatedAt: new Date(now - 100 * DAY + i * 3_600_000 + 60_000).toISOString(),
      currencyCode: "EUR",
      displayFinancialStatus: "PAID",
      totalPriceSet: { shopMoney: { amount: "121.00" } },
      totalTaxSet: { shopMoney: { amount: "21.00" } },
      shippingAddress: { countryCodeV2: "NL" },
      // Elke tiende order krijgt een retour op een latere datum: die mag de voortgang niet bepalen.
      refunds: i % 10 === 0 ? [{ id: `r${i}`, createdAt: new Date(now - DAY).toISOString(), totalRefundedSet: { shopMoney: { amount: "10.00" } } }] : [],
    }));
  }

  it("gaat na 8 pagina's verder bij de cursor en mist niets, ook als orders tussen de rondes veranderen", async () => {
    const now = Date.now();
    const store = shopifyStore(1000, now);
    const requests = fakeShopify(store);
    let c = conn();

    const first = await syncConnection(c);
    expect(first).toMatchObject({ hasMore: true });
    const s1 = h.connections.get("c1")!;
    // Voortgang = cursor, NIET de datum van de laatste retour; de venstergrens blijft leeg.
    expect(s1.lastSyncAt).toBeNull();
    expect(parseSyncCursor(s1.syncCursor as string)?.after).toBeTruthy();
    // Wel: wanneer deze ronde klaar was (voor scherm en rem).
    expect((s1.lastRunAt as Date).getTime()).toBeGreaterThanOrEqual(now);

    // Tussen de rondes: een al opgehaalde order wordt aangepast, en er komt een nieuwe bij.
    const changed = store[4];
    changed.totalPriceSet = { shopMoney: { amount: "60.50" } };
    changed.totalTaxSet = { shopMoney: { amount: "10.50" } };
    changed.updatedAt = new Date(now + 1000).toISOString();
    store.push({ ...store[999], id: "gid://shopify/Order/1001", name: "#2001", createdAt: new Date(now).toISOString(), updatedAt: new Date(now + 2000).toISOString(), refunds: [] });

    c = saved(c);
    const second = await syncConnection(c);
    expect(second.hasMore).toBe(false);
    const s2 = h.connections.get("c1")!;
    expect(s2.syncCursor).toBeNull();
    // Klaar: de venstergrens wordt het BEGIN van de doorloop, de laatste ronde is later.
    expect((s2.lastSyncAt as Date).getTime()).toBeLessThanOrEqual((s2.lastRunAt as Date).getTime());
    expect(s2.lastSyncAt).toEqual(new Date(parseSyncCursor(s1.syncCursor as string)!.startedAt));

    const sales = h.orders.filter((o) => o.kind === "SALE");
    expect(new Set(sales.map((o) => o.externalId)).size).toBe(1001);
    expect(h.orders.filter((o) => o.kind === "REFUND")).toHaveLength(100);
    // De aangepaste order kwam in dezelfde doorloop alsnog mee (sortering op updated_at).
    expect(Number(h.orders.find((o) => o.externalId === changed.id)!.totalGross)).toBe(60.5);
    expect(second.updated).toBeGreaterThanOrEqual(1);
    // Het venster (filter) blijft gelijk zodat de cursor geldig is.
    expect(new Set(requests.map((q) => q.filter)).size).toBe(1);
  });

  it("een gewone sync begint bij lastSyncAt min twee dagen; de eerste bij 120 dagen terug", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(syncWindow({ lastSyncAt: new Date("2026-11-10T00:00:00Z") }, now).since.toISOString()).toBe("2026-11-08T00:00:00.000Z");
    expect(syncWindow({ lastSyncAt: null }, now).since.getTime()).toBe(now.getTime() - FIRST_SYNC_DAYS * DAY);
  });

  it("een afgeronde doorloop zet lastSyncAt op het begin ervan, zodat tussentijdse wijzigingen meekomen", () => {
    const started = new Date("2026-11-01T08:00:00Z");
    const w = syncWindow({ lastSyncAt: null, syncCursor: JSON.stringify({ since: "2026-07-01T00:00:00.000Z", startedAt: started.toISOString(), page: 9 }) });
    expect(w.resume?.page).toBe(9);
    expect(w.since.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(syncStateAfter(null, w, { hasMore: false })).toEqual({ lastSyncAt: started, syncCursor: null });
    const more = syncStateAfter(null, w, { hasMore: true, next: { page: 17 } });
    expect(more.lastSyncAt).toBeNull();
    expect(parseSyncCursor(more.syncCursor)).toEqual({ since: "2026-07-01T00:00:00.000Z", startedAt: started.toISOString(), page: 17 });
  });

  it("een kapotte cursor valt terug op het gewone venster", () => {
    expect(parseSyncCursor("{kapot")).toBeNull();
    expect(parseSyncCursor(JSON.stringify({ since: "geen datum", startedAt: "x" }))).toBeNull();
  });

  const wooConn = () => conn({ platform: "WOOCOMMERCE", shopUrl: "https://winkel.example", credentials: `enc:${JSON.stringify({ consumerKey: "ck_12345678", consumerSecret: "cs_12345678" })}` });

  it("WooCommerce gaat verder op de onthouden pagina, met één pagina overlap", async () => {
    const now = Date.now();
    const store: FakeWooOrder[] = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1, status: "completed", currency: "EUR", total: "12.10", total_tax: "2.10",
      date_created_gmt: wooTime(now - 90 * DAY + i * 60_000), date_modified_gmt: wooTime(now - 90 * DAY + i * 60_000),
    }));
    const pages = fakeWoo(store);
    const c = wooConn();
    await syncConnection(c);
    expect(parseSyncCursor(h.connections.get("c1")!.syncCursor as string)?.page).toBe(9);
    const res = await syncConnection(saved(c));
    expect(res.hasMore).toBe(false);
    expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10]);
    expect(h.orders).toHaveLength(1000);
  });

  it("WooCommerce: verdwijnt er tussen twee rondes een order vóór de cursor (prullenbak), dan valt er toch niets weg", async () => {
    const now = Date.now();
    const store: FakeWooOrder[] = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1, status: "processing", currency: "EUR", total: "12.10", total_tax: "2.10",
      date_created_gmt: wooTime(now - 90 * DAY + i * 60_000), date_modified_gmt: wooTime(now - 90 * DAY + i * 60_000),
    }));
    fakeWoo(store);
    const c = wooConn();
    await syncConnection(c);
    expect(h.orders).toHaveLength(800);
    // Drie al opgehaalde orders gaan naar de prullenbak: de lijst schuift drie plekken naar voren.
    for (const i of [3, 250, 640]) store[i].status = "trash";
    await syncConnection(saved(c));
    // Order 801 stond eerst bovenaan pagina 9 en staat nu op pagina 8: hij is er toch.
    const ids = new Set(h.orders.map((o) => o.externalId));
    for (let id = 1; id <= 1000; id++) expect(ids.has(String(id))).toBe(true);
  });

  it("de rem van 30 seconden kijkt naar de laatste ronde, niet naar de (oude) venstergrens", async () => {
    h.session.user = { id: "u1", accountId: "u1", role: "USER", name: "Jan", email: "jan@example.nl" };
    const req = () => new Request("http://localhost/api/webshop/connections/c1/sync", { method: "POST" });
    const params = { params: Promise.resolve({ id: "c1" }) };
    // Net een ronde gedaan van een doorloop die drie dagen geleden begon.
    h.db.webshopConnection.findFirst.mockResolvedValueOnce(bolConn({ lastSyncAt: new Date(Date.now() - 3 * DAY), lastRunAt: new Date(Date.now() - 5_000), updatedAt: new Date(Date.now() - 5_000) }));
    expect((await syncRoute(req(), params)).status).toBe(429);

    // Een minuut later mag het weer.
    h.db.webshopConnection.findFirst.mockResolvedValueOnce(bolConn({ lastSyncAt: new Date(Date.now() - 3 * DAY), lastRunAt: new Date(Date.now() - 60_000), updatedAt: new Date(Date.now() - 60_000) }));
    fakeBol([], new Map());
    const res = await syncRoute(req(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ imported: 0, hasMore: false, pastQuarters: [] });
  });
});

// ---------------------------------------------------------------------------
// nr 39: geannuleerde en aangepaste bestellingen
// ---------------------------------------------------------------------------

describe("nr 39: annuleringen en wijzigingen komen door", () => {
  const base: ShopifyOrderNode = {
    id: "gid://shopify/Order/7", name: "#1007", createdAt: "2026-09-02T09:00:00Z", currencyCode: "EUR", displayFinancialStatus: "PAID",
    totalPriceSet: { shopMoney: { amount: "121.00" } }, totalTaxSet: { shopMoney: { amount: "21.00" } }, shippingAddress: { countryCodeV2: "DE" },
  };

  it("Shopify: geannuleerd zonder dat er iets is betaald telt niet mee", () => {
    for (const status of ["VOIDED", "PENDING", "AUTHORIZED", "EXPIRED"]) {
      expect(mapShopifyOrder({ ...base, cancelledAt: "2026-09-03T00:00:00Z", displayFinancialStatus: status })).toEqual([expect.objectContaining({ kind: "SALE", cancelled: true })]);
    }
  });

  it("Shopify: geannuleerd maar betaald en niet terugbetaald blijft belaste omzet", () => {
    for (const status of ["PAID", "PARTIALLY_PAID", null, undefined]) {
      const rows = mapShopifyOrder({ ...base, cancelledAt: "2026-09-03T00:00:00Z", displayFinancialStatus: status });
      expect(rows).toHaveLength(1);
      expect(rows[0].cancelled).toBeUndefined();
      expect(rows[0].totalGross).toBe(121);
    }
  });

  it("Shopify: geannuleerd met terugbetaling: verkoop en retour blijven staan, elk op hun datum", () => {
    const refunded = mapShopifyOrder({ ...base, cancelledAt: "2026-09-03T00:00:00Z", displayFinancialStatus: "REFUNDED", refunds: [{ id: "r1", createdAt: "2026-10-05T00:00:00Z", totalRefundedSet: { shopMoney: { amount: "121.00" } } }] });
    expect(refunded).toHaveLength(2);
    expect(refunded[0].cancelled).toBeUndefined();
    expect(refunded[1]).toMatchObject({ kind: "REFUND", totalGross: 121, orderDate: "2026-10-05" });
  });

  it("WooCommerce: alleen geannuleerd als er nooit is betaald; met terugstorting blijft de retour", () => {
    expect(mapWooOrder({ id: 3, status: "cancelled", currency: "EUR", total: "10", total_tax: "0" })).toEqual([expect.objectContaining({ cancelled: true })]);
    expect(mapWooOrder({ id: 3, status: "cancelled", currency: "EUR", total: "10", total_tax: "0", date_paid_gmt: null })).toEqual([expect.objectContaining({ cancelled: true })]);
    // Betaald en daarna op geannuleerd gezet, zonder terugbetaling: blijft omzet.
    const paid = mapWooOrder({ id: 5, status: "cancelled", currency: "EUR", total: "10", total_tax: "0", date_paid_gmt: "2026-09-01T10:00:00" });
    expect(paid).toHaveLength(1);
    expect(paid[0].cancelled).toBeUndefined();
    const rows = mapWooOrder({ id: 4, status: "cancelled", currency: "EUR", total: "10", total_tax: "0", date_paid_gmt: "2026-09-01T10:00:00", refunds: [{ id: 1, total: "-10.00" }] });
    expect(rows.map((r) => r.kind)).toEqual(["SALE", "REFUND"]);
    expect(rows.some((r) => r.cancelled)).toBe(false);
  });

  it("Bol.com: alles geannuleerd geeft een geannuleerde verkoop van 0", () => {
    const [o] = mapBolOrder({ orderId: "B9", orderPlacedDateTime: "2026-05-01T12:00:00+02:00", orderItems: [{ orderItemId: "i1", quantity: 1, unitPrice: 20, quantityCancelled: 1 }] });
    expect(o).toMatchObject({ externalId: "B9", cancelled: true, totalGross: 0, vatAmount: 0 });
  });

  it("orderUpdate ziet annuleren, weer doorgaan en bedragwijzigingen", () => {
    const [sale] = mapShopifyOrder(base);
    const now = new Date("2026-11-18T10:00:00Z");
    const row = {
      orderNumber: "#1007", orderDate: new Date("2026-09-02T00:00:00Z"), country: "DE", currency: "EUR",
      totalGross: "121.00", vatAmount: "21.00", shippingGross: "0.00", fees: "0.00", isBusiness: false, cancelledAt: null,
    };
    expect(orderUpdate(row, sale, now)).toBeNull();
    expect(orderUpdate(row, { ...sale, cancelled: true }, now)).toEqual({ cancelledAt: now });
    expect(orderUpdate({ ...row, cancelledAt: new Date("2026-10-01") }, sale, now)).toEqual({ cancelledAt: null });
    expect(orderUpdate({ ...row, cancelledAt: new Date("2026-10-01") }, { ...sale, cancelled: true }, now)).toBeNull();
    expect(orderUpdate(row, { ...sale, totalGross: 96.8, vatAmount: 16.8 }, now)).toEqual({ totalGross: 96.8, vatAmount: 16.8 });
  });

  it("upsertOrders werkt een eerder opgehaalde verkoop bij in plaats van hem te laten staan", async () => {
    const [sale] = mapShopifyOrder(base);
    expect(await upsertOrders("u1", "c1", [sale])).toMatchObject({ created: 1, updated: 0, changes: [] });
    expect(h.orders[0]).toMatchObject({ cancelledAt: null, checkedAt: expect.any(Date) });

    // Later geannuleerd en de betaling vrijgegeven (nooit geïnd).
    const cancelled = mapShopifyOrder({ ...base, cancelledAt: "2026-09-04T00:00:00Z", displayFinancialStatus: "VOIDED" });
    const res = await upsertOrders("u1", "c1", cancelled);
    expect(res).toMatchObject({ created: 0, updated: 1 });
    expect(res.changes).toEqual([expect.objectContaining({ externalId: base.id, data: { cancelledAt: expect.any(Date) } })]);
    expect(h.orders).toHaveLength(1);
    expect(h.orders[0].cancelledAt).toBeInstanceOf(Date);

    // Ongewijzigd terugzien: alleen checkedAt.
    expect(await upsertOrders("u1", "c1", cancelled)).toMatchObject({ created: 0, updated: 0 });
    expect(h.db.webshopOrder.updateMany).toHaveBeenCalled();
  });

  it("wijzigingen in een afgelopen kwartaal: welke kwartalen, en een leesbare regel met oud en nieuw", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const before = {
      orderNumber: "#1007", orderDate: new Date("2026-08-10T00:00:00Z"), country: "DE", currency: "EUR",
      totalGross: "121.00", vatAmount: "21.00", shippingGross: "0.00", fees: "0.00", isBusiness: false, cancelledAt: null,
    };
    const change = { externalId: "gid://shopify/Order/7", kind: "SALE" as const, before, data: { totalGross: 96.8, vatAmount: 16.8 } };
    expect(pastQuartersOf([change], now)).toEqual([{ year: 2026, quarter: 3 }]);
    expect(pastQuartersOf([{ ...change, before: { ...before, orderDate: new Date("2026-10-05T00:00:00Z") } }], now)).toEqual([]);
    // Datum schuift van K3 naar K4: K3 is geraakt.
    expect(pastQuartersOf([{ ...change, before: { ...before, orderDate: new Date("2026-09-30T00:00:00Z") }, data: { orderDate: new Date("2026-10-01T00:00:00Z") } }], now)).toEqual([{ year: 2026, quarter: 3 }]);
    // Het lopende kwartaal volgt de Nederlandse klok: oudejaarsavond 23:30 UTC is al 1 januari.
    expect(currentQuarter(new Date("2026-12-31T23:30:00Z"))).toEqual({ year: 2027, quarter: 1 });

    const line = describeOrderChange({ ...change, data: { totalGross: 96.8, vatAmount: 16.8, cancelledAt: now } }, "winkel.myshopify.com");
    expect(line).toContain("bestelling #1007 (2026 K3)");
    expect(line).toContain("bedrag 121,00 → 96,80");
    expect(line).toContain("btw 21,00 → 16,80");
    expect(line).toContain("geannuleerd");
  });

  it("een sync die een order in een afgelopen kwartaal wijzigt, logt oud en nieuw en noemt het kwartaal", async () => {
    const now = Date.now();
    const created = new Date(now - 200 * DAY); // altijd een kwartaal dat voorbij is
    const node: FakeShopifyOrder = { ...base, createdAt: created.toISOString(), updatedAt: new Date(now - DAY).toISOString() };
    fakeShopify([node]);
    await syncConnection(conn());
    expect(h.db.auditLog.create).not.toHaveBeenCalled();
    expect(h.db.auditLog.createMany).not.toHaveBeenCalled();

    // De winkel past het bedrag achteraf aan.
    node.totalPriceSet = { shopMoney: { amount: "96.80" } };
    node.totalTaxSet = { shopMoney: { amount: "16.80" } };
    node.updatedAt = new Date(now).toISOString();
    const res = await syncConnection(saved(conn()), { id: "a1", name: "Jan" });
    const q = { year: created.getUTCFullYear(), quarter: Math.floor(created.getUTCMonth() / 3) + 1 };
    expect(res).toMatchObject({ updated: 1, pastQuarters: [q] });
    // Eén createMany (afgewacht), geen losse fire-and-forget inserts.
    expect(h.db.auditLog.create).not.toHaveBeenCalled();
    expect(h.db.auditLog.createMany).toHaveBeenCalledTimes(1);
    const rows = (h.db.auditLog.createMany.mock.calls[0] as unknown as [{ data: { action: string; target: string; actorName: string; accountId: string }[] }])[0].data;
    expect(rows).toHaveLength(1);
    const data = rows[0];
    expect(data).toMatchObject({ action: "webshop.order_changed", actorName: "Jan", accountId: "u1" });
    expect(data.target).toContain("bedrag 121,00 → 96,80");
    expect(data.target).toContain(`(${q.year} K${q.quarter})`);
  });

  it("Bol.com: recente bekende orders worden in ELKE ronde gecontroleerd, ook als de lijst niet in één ronde past", async () => {
    const now = Date.now();
    // 600 orders, nieuwste eerst (12 pagina's van 50). De 550 nieuwste kennen we al; de 50 oudste niet.
    const list = Array.from({ length: 600 }, (_, i) => ({ orderId: `B${i}`, placed: new Date(now - i * 2 * 3_600_000).toISOString() }));
    const details = new Map(list.map((o) => [o.orderId, bolDetail(o.orderId, o.placed)]));
    for (const [i, o] of list.entries()) {
      if (i >= 550) continue;
      // Drie recente orders zijn nog nooit gecontroleerd; de rest net nog.
      storeBol(details.get(o.orderId)!, i < 3 ? null : new Date(now - 3_600_000));
    }
    // Bij Bol is B1 inmiddels geannuleerd.
    details.set("B1", bolDetail("B1", list[1].placed, 1));
    const bol = fakeBol(list, details);
    let c = bolConn();

    const r1 = await syncConnection(c);
    // Ronde 1 bladert pagina 1-8 (alles bekend) en is nog niet klaar ...
    expect(r1).toMatchObject({ hasMore: true, imported: 0, updated: 1 });
    expect(bol.listPages).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // ... maar heeft de recente orders toch al gecontroleerd: de annulering is binnen.
    expect(bol.detailCalls.sort()).toEqual(["B0", "B1", "B2"]);
    expect(h.orders.find((o) => o.externalId === "B1")!.cancelledAt).toBeInstanceOf(Date);
    expect(h.orders.find((o) => o.externalId === "B0")!.checkedAt).toBeInstanceOf(Date);

    bol.listPages.length = 0;
    bol.detailCalls.length = 0;
    c = saved(c);
    const r2 = await syncConnection(c);
    // Ronde 2 begint één pagina terug (8) en haalt de 50 nieuwe op; de net gecontroleerde niet opnieuw.
    expect(bol.listPages).toEqual([8, 9, 10, 11, 12, 13]);
    expect(r2).toMatchObject({ hasMore: false, imported: 50 });
    expect(bol.detailCalls.filter((id) => Number(id.slice(1)) < 550)).toEqual([]);
    expect(h.connections.get("c1")!.syncCursor).toBeNull();
  });

  it("Bol.com: ook met 50 of meer nieuwe orders per ronde blijft er ruimte voor de controle", async () => {
    const now = Date.now();
    const known = bolDetail("K1", new Date(now - 5 * DAY).toISOString());
    storeBol(known, null);
    const list = Array.from({ length: 120 }, (_, i) => ({ orderId: `N${i}`, placed: new Date(now - i * 60_000).toISOString() }));
    const details = new Map<string, BolOrderDetail>(list.map((o) => [o.orderId, bolDetail(o.orderId, o.placed)]));
    details.set("K1", bolDetail("K1", known.orderPlacedDateTime, 1));
    const bol = fakeBol([...list, { orderId: "K1", placed: known.orderPlacedDateTime }], details);
    const r1 = await syncConnection(bolConn());
    expect(r1.hasMore).toBe(true);
    expect(bol.detailCalls[0]).toBe("K1");
    expect(bol.detailCalls).toHaveLength(50); // 1 controle + 49 nieuwe
    expect(h.orders.find((o) => o.externalId === "K1")!.cancelledAt).toBeInstanceOf(Date);
  });

  it("Bol.com: na een 429 en een vol budget gaat de sync verder waar hij was, zonder iets te missen", async () => {
    const now = Date.now();
    const list = Array.from({ length: 120 }, (_, i) => ({ orderId: `N${i}`, placed: new Date(now - i * 60_000).toISOString() }));
    const details = new Map(list.map((o) => [o.orderId, bolDetail(o.orderId, o.placed)]));
    // Het 30e detailverzoek krijgt "te veel verzoeken".
    const bol = fakeBol(list, details, { limitOnDetailCall: 30 });
    let c = bolConn();
    const r1 = await syncConnection(c);
    expect(r1).toMatchObject({ hasMore: true, imported: 29 });
    expect(parseSyncCursor(h.connections.get("c1")!.syncCursor as string)?.page).toBe(1);

    const rounds: { hasMore: boolean; pages: number[] }[] = [];
    for (let i = 0; i < 5 && h.connections.get("c1")!.syncCursor; i++) {
      bol.listPages.length = 0;
      c = saved(c);
      const r = await syncConnection(c);
      rounds.push({ hasMore: r.hasMore, pages: [...bol.listPages] });
    }
    // Ronde 2: pagina 1 opnieuw (bekende overgeslagen), budget op in pagina 2. Ronde 3: vanaf pagina 1 (2 - 1).
    expect(rounds[0].pages[0]).toBe(1);
    expect(rounds[1].pages[0]).toBe(1);
    expect(rounds.at(-1)!.hasMore).toBe(false);
    expect(new Set(h.orders.map((o) => o.externalId)).size).toBe(120);
    // Elke order één keer met succes opgevraagd.
    expect(bol.detailCalls).toHaveLength(120);
  });

  it("Bol.com: een order die Bol niet meer geeft, houdt de controle niet vast", async () => {
    const now = Date.now();
    storeBol(bolDetail("GONE", new Date(now - 2 * DAY).toISOString()), null);
    const bol = fakeBol([], new Map());
    await syncConnection(bolConn());
    expect(bol.detailCalls).toEqual(["GONE"]);
    expect(h.orders[0].checkedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// nr 38: bankimport ontdubbelt alleen tegen eerdere imports
// ---------------------------------------------------------------------------

describe("nr 38: gelijke banktransacties op één dag", () => {
  const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  const tx = { date: "2026-08-05", amount: 121, direction: "CREDIT" as const, description: "Acme B.V. — Factuur" };

  it("gelijke regels in één bestand krijgen een volgnummer; de eerste houdt de oude sleutel", () => {
    expect(bankDedupeKeys([tx, tx, { ...tx, amount: 50 }, tx])).toEqual([
      "2026-08-05|121|CREDIT|Acme B.V. — Factuur",
      "2026-08-05|121|CREDIT|Acme B.V. — Factuur|#1",
      "2026-08-05|50|CREDIT|Acme B.V. — Factuur",
      "2026-08-05|121|CREDIT|Acme B.V. — Factuur|#2",
    ]);
  });

  it("Knab-achtig: twee betalers met dezelfde omschrijving blijven twee transacties", () => {
    const csv = [
      "Rekeningnummer;Transactiedatum;CreditDebet;Bedrag;Tegenrekeningnummer;Tegenrekeninghouder;Omschrijving",
      "NL01KNAB;05-08-2026;C;25,00;NL11BANK0001;Jan;Contributie",
      "NL01KNAB;05-08-2026;C;25,00;NL22BANK0002;Piet;Contributie",
    ].join("\n");
    const rows = parseBankCsvRows(csv)!;
    expect(rows).toHaveLength(2);
    const keys = bankDedupeKeys(rows);
    expect(new Set(keys).size).toBe(2);
  });

  it("de route importeert beide gelijke regels en toont welke regel al bestond", async () => {
    h.session.user = { id: "a1", accountId: "a1", role: "USER", name: "Jan", email: "jan@example.nl" };
    const other = { date: "2026-08-04", amount: 9.95, direction: "DEBIT" as const, description: "Abonnement" };
    // "other" is eerder al geïmporteerd (met de oude sleutel).
    h.db.bankTransaction.findMany.mockImplementation(async ({ where }: { where: { dedupeHash: { in: string[] } } }) =>
      where.dedupeHash.in.filter((x) => x === sha("2026-08-04|9.95|DEBIT|Abonnement")).map((dedupeHash) => ({ dedupeHash })));
    h.db.bankTransaction.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));

    const res = await bankImport(new Request("http://localhost/api/bank/import", { method: "POST", body: JSON.stringify({ transactions: [tx, tx, other] }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ imported: 2, duplicates: 1, skipped: [{ date: "2026-08-04", amount: 9.95, direction: "DEBIT", description: "Abonnement" }], skippedMore: 0 });
    const data = h.db.bankTransaction.createMany.mock.calls[0][0].data as { dedupeHash: string }[];
    expect(data.map((d) => d.dedupeHash)).toEqual([sha("2026-08-05|121|CREDIT|Acme B.V. — Factuur"), sha("2026-08-05|121|CREDIT|Acme B.V. — Factuur|#1")]);
  });
});

// ---------------------------------------------------------------------------
// Review fase 2 op nr 12 en 39
// ---------------------------------------------------------------------------

describe("review: nagekomen rijen, inhaalronde, Bol-controle, logboek en cursor", () => {
  const wooConn = (over: Partial<WebshopConnection> = {}) =>
    conn({ platform: "WOOCOMMERCE", name: "winkel.example", shopUrl: "https://winkel.example", credentials: `enc:${JSON.stringify({ consumerKey: "ck_12345678", consumerSecret: "cs_12345678" })}`, ...over });
  const auditRows = (call = 0) => (h.db.auditLog.createMany.mock.calls[call] as unknown as [{ data: { target: string }[] }])[0].data;

  it("Woo-retour krijgt de wijzigingsdatum (K3-order, K4 terugbetaald), nooit vóór de verkoop; zonder datum de verkoopdatum", () => {
    const order: WooOrder = { id: 9, status: "cancelled", currency: "EUR", total: "121.00", total_tax: "21.00", date_created_gmt: "2026-09-20T10:00:00", date_paid_gmt: "2026-09-20T10:05:00", refunds: [{ id: 1, total: "-121.00" }] };
    const [sale, refund] = mapWooOrder({ ...order, date_modified_gmt: "2026-10-05T08:00:00" });
    expect(sale).toMatchObject({ kind: "SALE", orderDate: "2026-09-20" });
    expect(refund).toMatchObject({ kind: "REFUND", orderDate: "2026-10-05", keepStoredDate: true, totalGross: 121 });
    expect(mapWooOrder({ ...order, date_modified_gmt: "2026-09-01T08:00:00" })[1].orderDate).toBe("2026-09-20");
    expect(mapWooOrder(order)[1].orderDate).toBe("2026-09-20");

    // Een opgeslagen retour verschuift niet als de order later nog eens wijzigt.
    const now = new Date("2026-11-20T10:00:00Z");
    const stored = orderRowData(refund, now);
    const later = mapWooOrder({ ...order, date_modified_gmt: "2026-11-19T08:00:00" })[1];
    expect(orderUpdate(stored, later, now)).toBeNull();
  });

  it("Woo: annuleren met terugbetaling op een order uit een vorig kwartaal laat dat kwartaal staan", async () => {
    const now = Date.now();
    const created = now - 200 * DAY; // altijd een kwartaal dat voorbij is
    const base: FakeWooOrder = { id: 41, number: "1041", status: "completed", currency: "EUR", total: "121.00", total_tax: "21.00", date_created_gmt: wooTime(created), date_paid_gmt: wooTime(created), date_modified_gmt: wooTime(created) };
    // Eerder al opgehaald.
    await upsertOrders("u1", "c1", mapWooOrder(base));
    // Nu geannuleerd en terugbetaald.
    fakeWoo([{ ...base, status: "cancelled", refunds: [{ id: 5, total: "-121.00" }], date_modified_gmt: wooTime(now) }]);
    const res = await syncConnection(wooConn({ lastSyncAt: new Date(now - DAY), lastRunAt: new Date(now - DAY) }));
    const refund = h.orders.find((o) => o.kind === "REFUND")!;
    expect((refund.orderDate as Date).toISOString().slice(0, 10)).toBe(new Date(now).toISOString().slice(0, 10));
    expect(res).toMatchObject({ imported: 1, updated: 0, pastQuarters: [] });
    // De verkoop blijft staan in zijn eigen kwartaal.
    expect(h.orders.find((o) => o.kind === "SALE")).toMatchObject({ cancelledAt: null });
    expect(h.db.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("Woo zonder wijzigingsdatum: de retour valt in het oude kwartaal, en dat wordt gemeld en gelogd", async () => {
    const now = Date.now();
    const created = new Date(now - 200 * DAY);
    const base: FakeWooOrder = { id: 42, number: "1042", status: "completed", currency: "EUR", total: "121.00", total_tax: "21.00", date_created_gmt: wooTime(created.getTime()), date_paid_gmt: wooTime(created.getTime()), date_modified_gmt: wooTime(now) };
    await upsertOrders("u1", "c1", mapWooOrder(base));
    fakeWoo([{ ...base, status: "cancelled", refunds: [{ id: 6, total: "-121.00" }] }], { hideModified: true });
    const res = await syncConnection(wooConn({ lastSyncAt: new Date(now - DAY), lastRunAt: new Date(now - DAY) }), { id: "a1", name: "Jan" });
    const q = { year: created.getUTCFullYear(), quarter: Math.floor(created.getUTCMonth() / 3) + 1 };
    expect(res.pastQuarters).toEqual([q]);
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toContain(`nieuwe retour 1042 (${q.year} K${q.quarter})`);
    expect(rows[0].target).toContain("gaat af van de omzet");
    expect(rows[0].target).toContain("bedrag 121,00");
    expect(rows[0].target).toContain("btw 21,00");
  });

  it("een nieuwe verkoop in een afgelopen kwartaal wordt gemeld, maar niet bij de eerste import", async () => {
    const now = Date.now();
    const node: FakeShopifyOrder = {
      id: "gid://shopify/Order/77", name: "#1077", createdAt: new Date(now - 200 * DAY).toISOString(), updatedAt: new Date(now - DAY).toISOString(),
      currencyCode: "EUR", displayFinancialStatus: "PAID", totalPriceSet: { shopMoney: { amount: "50.00" } }, totalTaxSet: { shopMoney: { amount: "8.68" } }, shippingAddress: { countryCodeV2: "BE" },
    };
    fakeShopify([node]);
    // Eerste import: oude geschiedenis is de bedoeling.
    expect(await syncConnection(conn())).toMatchObject({ imported: 1, pastQuarters: [] });
    expect(h.db.auditLog.createMany).not.toHaveBeenCalled();

    // Later: een order die eerder was gemist komt alsnog binnen.
    h.orders.length = 0;
    const res = await syncConnection(conn({ lastSyncAt: new Date(now - 3 * DAY), lastRunAt: new Date(now - 3 * DAY) }));
    expect(res.pastQuarters).toHaveLength(1);
    const rows = auditRows();
    expect(rows[0].target).toContain("nieuwe bestelling #1077");
    expect(rows[0].target).toContain("telt mee in de omzet");
    expect(rows[0].target).toContain("land BE");
  });

  it("lukt het logboek niet, dan slaagt de sync toch en blijft de melding staan", async () => {
    const now = Date.now();
    const node: FakeShopifyOrder = { id: "gid://shopify/Order/78", name: "#1078", createdAt: new Date(now - 200 * DAY).toISOString(), updatedAt: new Date(now - DAY).toISOString(), currencyCode: "EUR", displayFinancialStatus: "PAID", totalPriceSet: { shopMoney: { amount: "50.00" } }, totalTaxSet: { shopMoney: { amount: "8.68" } } };
    fakeShopify([node]);
    h.db.auditLog.createMany.mockRejectedValueOnce(new Error("db weg"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await syncConnection(conn({ lastSyncAt: new Date(now - 3 * DAY), lastRunAt: new Date(now - 3 * DAY) }));
    expect(res.pastQuarters).toHaveLength(1);
    expect(h.connections.get("c1")).toMatchObject({ status: "ACTIVE" });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("inhaalronde: een oude koppeling haalt eenmalig alles sinds het koppelen opnieuw op, ook gemiste orders", async () => {
    const now = Date.now();
    const mk = (n: number, createdAgo: number, updatedAgo: number): FakeShopifyOrder => ({
      id: `gid://shopify/Order/${n}`, name: `#${n}`, createdAt: new Date(now - createdAgo * DAY).toISOString(), updatedAt: new Date(now - updatedAgo * DAY).toISOString(),
      currencyCode: "EUR", displayFinancialStatus: "PAID", totalPriceSet: { shopMoney: { amount: "121.00" } }, totalTaxSet: { shopMoney: { amount: "21.00" } }, shippingAddress: { countryCodeV2: "NL" },
    });
    // Order 1 en 2 zijn door de oude fout overgeslagen; order 3 staat er al.
    const store = [mk(1, 140, 140), mk(2, 130, 130), mk(3, 1, 1)];
    await upsertOrders("u1", "c1", mapShopifyOrder(store[2]));
    const requests = fakeShopify(store);
    // Oude koppeling: lastSyncAt stond (te ver) vooruit, lastRunAt is leeg.
    const old = conn({ createdAt: new Date(now - 30 * DAY), lastSyncAt: new Date(now - DAY), lastRunAt: null });
    expect(syncWindow(old, new Date(now))).toMatchObject({ catchUp: true, since: new Date(now - 150 * DAY) });

    const res = await syncConnection(old);
    expect(res).toMatchObject({ catchUp: true, imported: 2, hasMore: false });
    expect(new Set(h.orders.map((o) => o.externalId))).toEqual(new Set(store.map((o) => o.id)));
    // Gemiste orders in een afgelopen kwartaal worden gemeld.
    expect(res.pastQuarters.length).toBeGreaterThanOrEqual(1);
    expect(requests[0].filter).toBe(`updated_at:>=${new Date(now - 150 * DAY).toISOString().slice(0, 10)}`);

    // Daarna gewoon weer vanaf lastSyncAt min twee dagen.
    const next = await syncConnection(saved(old));
    expect(next.catchUp).toBe(false);
    const lastSyncAt = h.connections.get("c1")!.lastSyncAt as Date;
    expect(requests.at(-1)!.filter).toBe(`updated_at:>=${new Date(lastSyncAt.getTime() - 2 * DAY).toISOString().slice(0, 10)}`);
    // Een koppeling van na de deploy (lastRunAt gezet) of een nieuwe krijgt geen inhaalronde.
    expect(syncWindow({ lastSyncAt: new Date(now - DAY), lastRunAt: new Date(now - DAY) }).catchUp).toBe(false);
    expect(syncWindow({ lastSyncAt: null, lastRunAt: null }).catchUp).toBe(false);
  });

  it("Bol.com: blijft er na het bladeren budget over, dan worden er meer bekende orders nagekeken; de rest wordt gemeld", async () => {
    const now = Date.now();
    const details = new Map<string, BolOrderDetail>();
    for (let i = 0; i < 80; i++) {
      const d = bolDetail(`K${i}`, new Date(now - (i % 20) * DAY).toISOString());
      details.set(d.orderId, d);
      storeBol(d, null);
    }
    const bol = fakeBol([], details);
    const r1 = await syncConnection(bolConn());
    // 20 vooraf + 30 met het overgebleven budget.
    expect(bol.detailCalls).toHaveLength(50);
    expect(r1).toMatchObject({ hasMore: false, recheckBacklog: 30 });
    bol.detailCalls.length = 0;
    const r2 = await syncConnection(saved(bolConn()));
    expect(bol.detailCalls).toHaveLength(30);
    expect(r2.recheckBacklog).toBe(0);
  });

  it("Bol.com: laat de lijst een annulering zien bij een bekende order, dan wordt die meteen nagekeken", async () => {
    const now = Date.now();
    // Ouder dan 30 dagen: niet via de wachtrij, wel binnen het venster van de eerste sync.
    const placed = new Date(now - 40 * DAY).toISOString();
    storeBol(bolDetail("H1", placed), new Date(now - 3_600_000));
    storeBol(bolDetail("H2", placed, 1), new Date(now - 13 * 3_600_000));
    storeBol(bolDetail("H3", placed), new Date(now - 13 * 3_600_000));
    const details = new Map([["H1", bolDetail("H1", placed, 1)], ["H2", bolDetail("H2", placed, 1)], ["H3", bolDetail("H3", placed)]]);
    const list: BolListEntry[] = [
      { orderId: "H1", placed, items: [{ quantityCancelled: 1 }] },
      { orderId: "H2", placed, items: [{ quantityCancelled: 1 }] }, // al helemaal geannuleerd
      { orderId: "H3", placed, items: [{ quantityCancelled: 0 }] }, // niets aan de hand
    ];
    // H1 is net nog gecontroleerd: nu niet opnieuw.
    let bol = fakeBol(list, details);
    await syncConnection(bolConn());
    expect(bol.detailCalls).toEqual([]);
    // Een halve dag later wel.
    h.orders.find((o) => o.externalId === "H1")!.checkedAt = new Date(now - 13 * 3_600_000);
    bol = fakeBol(list, details);
    await syncConnection(bolConn());
    expect(bol.detailCalls).toEqual(["H1"]);
    expect(h.orders.find((o) => o.externalId === "H1")!.cancelledAt).toBeInstanceOf(Date);
  });

  it("WooCommerce: mislukte checkouts en concepten worden niet opgeslagen en tellen niet als nieuw; een bekende order wel gemarkeerd", async () => {
    const now = Date.now();
    const t = wooTime(now - DAY);
    const o = (id: number, status: string, paid: boolean): FakeWooOrder => ({ id, status, currency: "EUR", total: "24.20", total_tax: "4.20", date_created_gmt: t, date_modified_gmt: t, ...(paid ? { date_paid_gmt: t } : {}) });
    // Order 4 stond er al als verkoop (toen in de wacht); nu geannuleerd zonder betaling.
    await upsertOrders("u1", "c1", mapWooOrder(o(4, "on-hold", false)));
    fakeWoo([o(1, "checkout-draft", false), o(2, "failed", false), o(3, "processing", true), o(4, "cancelled", false), o(5, "pending", false)]);
    const res = await syncConnection(wooConn());
    expect(res).toMatchObject({ imported: 1, updated: 1 });
    expect(h.orders.map((r) => r.externalId).sort()).toEqual(["3", "4"]);
    expect(h.orders.find((r) => r.externalId === "4")!.cancelledAt).toBeInstanceOf(Date);
  });

  it("Bol.com: een helemaal geannuleerde nieuwe order wordt bewaard (minder verzoeken), maar telt niet als nieuw", async () => {
    const placed = new Date(Date.now() - DAY).toISOString();
    fakeBol([{ orderId: "X1", placed }, { orderId: "X2", placed }], new Map([["X1", bolDetail("X1", placed, 1)], ["X2", bolDetail("X2", placed)]]));
    const res = await syncConnection(bolConn());
    expect(res.imported).toBe(1);
    expect(h.orders).toHaveLength(2);
  });

  it("Shopify weigert een opgeslagen cursor: hetzelfde venster opnieuw vanaf het begin, en de cursor wordt gewist", async () => {
    const now = Date.now();
    const node: FakeShopifyOrder = { id: "gid://shopify/Order/90", name: "#1090", createdAt: new Date(now - 10 * DAY).toISOString(), updatedAt: new Date(now - 10 * DAY).toISOString(), currencyCode: "EUR", displayFinancialStatus: "PAID", totalPriceSet: { shopMoney: { amount: "10.00" } }, totalTaxSet: { shopMoney: { amount: "0.00" } } };
    const requests = fakeShopify([node]);
    const impl = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { variables: { cursor: string | null } };
      if (body.variables.cursor === "verlopen") {
        requests.push({ filter: "", cursor: "verlopen" });
        return json({ errors: [{ message: "Invalid cursor for current pagination sort." }] });
      }
      return impl(url, init);
    });
    const since = new Date(now - 30 * DAY).toISOString();
    const startedAt = new Date(now - 60_000).toISOString();
    const c = conn({ lastSyncAt: new Date(now - 32 * DAY), lastRunAt: new Date(now - 60_000), syncCursor: JSON.stringify({ since, startedAt, after: "verlopen" }) });
    const res = await syncConnection(c);
    expect(res.hasMore).toBe(false);
    expect(requests.map((r) => r.cursor)).toEqual(["verlopen", null]);
    expect(h.orders).toHaveLength(1);
    expect(h.connections.get("c1")).toMatchObject({ status: "ACTIVE", syncCursor: null, lastSyncAt: new Date(startedAt) });
  });

  it("Shopify-fouten: de tekst van Shopify komt in de melding; bij te veel verzoeken geen herstart", async () => {
    h.fetch.mockImplementation(async () => json({ errors: [{ message: "Field 'orders' doesn't exist on type 'QueryRoot'" }] }));
    await expect(syncConnection(conn())).rejects.toMatchObject({ status: 422, message: expect.stringContaining("Field 'orders' doesn't exist") });
    expect(h.connections.get("c1")!.lastError).toContain("Shopify gaf geen bestellingen terug: Field 'orders'");

    h.fetch.mockReset();
    h.connections.clear();
    h.fetch.mockImplementation(async () => json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }));
    const cursor = JSON.stringify({ since: new Date().toISOString(), startedAt: new Date().toISOString(), after: "ergens" });
    await expect(syncConnection(conn({ syncCursor: cursor, lastRunAt: new Date() }))).rejects.toMatchObject({ status: 429 });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    // De cursor blijft staan (de fout-update raakt hem niet): de volgende ronde gaat verder waar hij was.
    expect(h.connections.get("c1")).not.toHaveProperty("syncCursor");
  });
});
