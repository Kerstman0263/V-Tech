import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";

// GET /api/inbox — bonnetjes-inbox van het account (zonder bestandsdata; die via /api/inbox/[id]).
// ?status=NEW (default) | PROCESSED | DISMISSED | ALL
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const status = new URL(req.url).searchParams.get("status") ?? "NEW";
    const items = await db.inboxItem.findMany({
      where: { userId: user.accountId, ...(status === "ALL" ? {} : { status: status === "PROCESSED" || status === "DISMISSED" ? status : "NEW" }) },
      select: { id: true, fromEmail: true, subject: true, body: true, fileName: true, mimeType: true, size: true, status: true, expenseId: true, receivedAt: true },
      orderBy: { receivedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(items);
  } catch (err) {
    return errorResponse(err);
  }
}
