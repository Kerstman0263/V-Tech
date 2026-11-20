import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { assertNotDemo } from "@/lib/demo";
import { logAccount } from "@/lib/audit";
import { createConnectionSchema } from "@/lib/validations/webshop";
import { normalizeShopUrl, normalizeShopifyDomain } from "@/lib/webshop/safe-url";
import { fetchForConnection, requireWebshopAccess, sealCredentials, upsertOrders } from "@/lib/webshop/service";

// GET /api/webshop/connections — koppelingen van dit account (zonder sleutels).
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const connections = await db.webshopConnection.findMany({
      where: { userId: user.accountId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, platform: true, name: true, shopUrl: true, status: true,
        lastSyncAt: true, lastRunAt: true, lastError: true, createdAt: true,
        // Geannuleerde bestellingen tellen niet mee (WebshopOrder.cancelledAt).
        _count: { select: { orders: { where: { cancelledAt: null } } } },
      },
    });
    return NextResponse.json(connections.map(({ _count, ...c }) => ({ ...c, orderCount: _count.orders })));
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/webshop/connections — winkel koppelen. We testen de sleutels
// meteen door de eerste bestellingen op te halen; pas als dat lukt slaan we
// de (versleutelde) sleutels op.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    // Demo: geen echte winkelsleutels in een account dat iedereen kan openen.
    assertNotDemo(user);
    await requireWebshopAccess(user);
    const parsed = createConnectionSchema.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(422, "Vul alle velden in. Controleer of je de sleutels volledig hebt geplakt.");
    const input = parsed.data;

    const count = await db.webshopConnection.count({ where: { userId: user.accountId, platform: { not: "CSV" }, status: { not: "DISCONNECTED" } } });
    if (count >= 10) throw new HttpError(422, "Je kunt maximaal 10 winkels tegelijk koppelen.");

    let name: string;
    let shopUrl: string | null;
    let creds: Parameters<typeof sealCredentials>[0];
    if (input.platform === "SHOPIFY") {
      shopUrl = normalizeShopifyDomain(input.shopUrl);
      name = shopUrl;
      creds = { accessToken: input.accessToken };
    } else if (input.platform === "WOOCOMMERCE") {
      const url = normalizeShopUrl(input.shopUrl);
      shopUrl = url.toString().replace(/\/$/, "");
      name = url.hostname;
      creds = { consumerKey: input.consumerKey, consumerSecret: input.consumerSecret };
    } else {
      shopUrl = null;
      name = "Bol.com";
      creds = { clientId: input.clientId, clientSecret: input.clientSecret };
    }

    // Eerste ophaalronde = test van de sleutels. Faalt dit, dan slaan we niets op.
    const result = await fetchForConnection({ id: "new", platform: input.platform, shopUrl, credentials: null, lastSyncAt: null, syncCursor: null }, creds);

    const connection = await db.webshopConnection.create({
      data: {
        userId: user.accountId,
        platform: input.platform,
        name,
        shopUrl,
        credentials: sealCredentials(creds),
        status: "ACTIVE",
        // Was er meer: de cursor onthoudt waar de volgende sync verdergaat.
        lastSyncAt: result.state.lastSyncAt,
        syncCursor: result.state.syncCursor,
        lastRunAt: new Date(),
      },
      select: { id: true },
    });
    const { created: imported } = await upsertOrders(user.accountId, connection.id, result.orders);
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "webshop.connected", `${input.platform} — ${name}`);

    return NextResponse.json({ id: connection.id, imported, hasMore: result.hasMore }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
