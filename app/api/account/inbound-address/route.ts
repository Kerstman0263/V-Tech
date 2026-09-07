import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { generateInboundToken, inboundAddress, INBOUND_DOMAIN } from "@/lib/inbound-mail";
import { logAccount } from "@/lib/audit";

function ownerOnly(user: { id: string; accountId: string }) {
  if (user.id !== user.accountId) throw new HttpError(403, "Alleen de account-eigenaar beheert het inbox-adres.");
}

async function uniqueToken(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = generateInboundToken();
    const clash = await db.user.findUnique({ where: { inboundToken: token }, select: { id: true } });
    if (!clash) return token;
  }
  throw new HttpError(500, "Kon geen uniek adres maken, probeer opnieuw.");
}

// GET /api/account/inbound-address — huidig adres (maakt er één aan als het nog niet bestaat)
export async function GET() {
  try {
    const user = await requireUser();
    ownerOnly(user);
    let u = await db.user.findUnique({ where: { id: user.id }, select: { inboundToken: true } });
    if (!u?.inboundToken) {
      const token = await uniqueToken();
      u = await db.user.update({ where: { id: user.id }, data: { inboundToken: token }, select: { inboundToken: true } });
    }
    return NextResponse.json({ address: inboundAddress(u.inboundToken!), domain: INBOUND_DOMAIN(), active: !!process.env.INBOUND_WEBHOOK_SECRET && process.env.INBOUND_EMAIL_LIVE === "1" });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/account/inbound-address — nieuw adres (oude werkt direct niet meer)
export async function POST() {
  try {
    const user = await requireUser();
    ownerOnly(user);
    const token = await uniqueToken();
    await db.user.update({ where: { id: user.id }, data: { inboundToken: token } });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "inbox.address_rotated", null);
    return NextResponse.json({ address: inboundAddress(token), domain: INBOUND_DOMAIN(), active: !!process.env.INBOUND_WEBHOOK_SECRET && process.env.INBOUND_EMAIL_LIVE === "1" });
  } catch (err) {
    return errorResponse(err);
  }
}
