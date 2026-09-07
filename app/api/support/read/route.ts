import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";

// POST /api/support/read — markeer alle admin-berichten als gelezen
export async function POST() {
  try {
    const user = await requireUser();
    await db.supportMessage.updateMany({
      where: { userId: user.id, senderRole: "ADMIN", readByUser: false },
      data: { readByUser: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
