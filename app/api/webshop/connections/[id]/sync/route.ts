import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { requireWebshopAccess, syncConnection } from "@/lib/webshop/service";

// Ophalen bij een platform kan even duren.
export const maxDuration = 60;

// POST /api/webshop/connections/[id]/sync — nieuwe bestellingen ophalen.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireWebshopAccess(user);
    const { id } = await params;
    const conn = await db.webshopConnection.findFirst({ where: { id, userId: user.accountId } });
    if (!conn) throw new HttpError(404, "Koppeling niet gevonden.");
    if (conn.platform === "CSV") throw new HttpError(400, "Een CSV-import werk je bij door een nieuw bestand te uploaden.");
    if (conn.status === "DISCONNECTED" || !conn.credentials) throw new HttpError(409, "Deze winkel is ontkoppeld. Koppel hem opnieuw om te synchroniseren.");
    // Niet vaker dan eens per 30 seconden: platforms hebben zelf ook limieten.
    if (conn.updatedAt.getTime() > Date.now() - 30_000 && conn.lastSyncAt && conn.lastSyncAt.getTime() > Date.now() - 30_000) {
      throw new HttpError(429, "Net gesynchroniseerd. Probeer het over een halve minuut opnieuw.");
    }
    const result = await syncConnection(conn);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
