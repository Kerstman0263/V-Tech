import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { logAccount } from "@/lib/audit";
import { importOrdersSchema } from "@/lib/validations/webshop";
import { requireWebshopAccess, storeOrders } from "@/lib/webshop/service";

// POST /api/webshop/import — orders uit een CSV-export (in de browser gelezen
// met lib/webshop/csv). Per bron één "CSV-koppeling", zodat dubbele imports
// van hetzelfde bestand worden herkend.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await requireWebshopAccess(user);
    const parsed = importOrdersSchema.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(422, "Dit bestand bevat bestellingen die we niet goed konden lezen.");
    const { source, orders } = parsed.data;

    for (const o of orders) {
      if (o.vatAmount > o.totalGross) throw new HttpError(422, `Bij bestelling ${o.orderNumber ?? o.externalId} is de btw hoger dan het totaal.`);
    }

    const existing = await db.webshopConnection.findFirst({ where: { userId: user.accountId, platform: "CSV", name: source } });
    const connection = existing ?? await db.webshopConnection.create({
      data: { userId: user.accountId, platform: "CSV", name: source, status: "ACTIVE" },
    });
    const imported = await storeOrders(user.accountId, connection.id, orders);
    await db.webshopConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), status: "ACTIVE" } });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "webshop.imported", `${source} — ${imported} orders`);

    return NextResponse.json({ imported, duplicates: orders.length - imported });
  } catch (err) {
    return errorResponse(err);
  }
}
