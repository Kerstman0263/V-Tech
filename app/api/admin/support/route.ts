import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/auth-helpers";

// GET /api/admin/support — overzicht van alle support-threads
export async function GET() {
  try {
    await requireAdmin();

    const users = await db.user.findMany({
      where: { supportMessages: { some: {} } },
      select: {
        id: true,
        name: true,
        company: { select: { name: true } },
        email: true,
        supportThread: { select: { status: true } },
        supportMessages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: {
          select: {
            supportMessages: { where: { senderRole: "USER", readByAdmin: false } },
          },
        },
      },
    });

    const threads = users
      .map((u) => ({
        userId: u.id,
        name: u.company?.name ?? u.name ?? u.email,
        email: u.email,
        status: u.supportThread?.status ?? "OPEN",
        lastMessage: u.supportMessages[0]?.body ?? "",
        lastAt: u.supportMessages[0]?.createdAt ?? null,
        unread: u._count.supportMessages,
      }))
      .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));

    return NextResponse.json(threads);
  } catch (err) {
    return errorResponse(err);
  }
}
