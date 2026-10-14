import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { logAccount } from "@/lib/audit";

// DELETE /api/webshop/connections/[id] — ontkoppelen. De sleutels worden gewist;
// de bestellingen blijven bewaard (ze horen bij je administratie, bewaarplicht).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const conn = await db.webshopConnection.findFirst({ where: { id, userId: user.accountId }, select: { id: true, name: true, platform: true } });
    if (!conn) throw new HttpError(404, "Koppeling niet gevonden.");
    await db.webshopConnection.update({
      where: { id: conn.id },
      data: { credentials: null, status: "DISCONNECTED", lastError: null },
    });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "webshop.disconnected", `${conn.platform} — ${conn.name}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
