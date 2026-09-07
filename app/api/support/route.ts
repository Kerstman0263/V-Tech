import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { isPaidPlan } from "@/lib/plans";
import { sendMessageSchema } from "@/lib/validations/support";
import { setThreadStatus, notifyAdminNewMessage } from "@/lib/support";

// Controleert dat de gebruiker een betaald plan heeft (Groei/Pro).
async function assertPaid(userId: string) {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub || !isPaidPlan(sub.plan)) {
    throw new HttpError(402, "Support-chat vereist een Groei- of Pro-abonnement.");
  }
}

// GET /api/support — eigen thread + status + aantal ongelezen admin-berichten
export async function GET() {
  try {
    const user = await requireUser();
    await assertPaid(user.accountId);

    const [messages, thread] = await Promise.all([
      db.supportMessage.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      }),
      db.supportThread.findUnique({ where: { userId: user.id } }),
    ]);
    const unread = messages.filter((m) => m.senderRole === "ADMIN" && !m.readByUser).length;
    // "Gezien": is het laatste klant-bericht door de admin gelezen?
    const lastUser = [...messages].reverse().find((m) => m.senderRole === "USER");
    const seen = lastUser ? lastUser.readByAdmin : false;

    return NextResponse.json({ messages, unread, status: thread?.status ?? "OPEN", seen });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/support — gebruiker stuurt een bericht
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await assertPaid(user.accountId);
    rateLimit(`support:${user.id}`, 10, 60 * 1000);

    const parsed = sendMessageSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const message = await db.supportMessage.create({
      data: {
        userId: user.id,
        senderRole: "USER",
        body: parsed.data.body,
        readByUser: true,
        readByAdmin: false,
      },
    });

    // Nieuw klant-bericht -> thread weer OPEN + admin notificeren
    await setThreadStatus(user.id, "OPEN");
    const me = await db.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, company: { select: { name: true } } } });
    await notifyAdminNewMessage(me?.company?.name ?? me?.name ?? me?.email ?? "Een klant", parsed.data.body);

    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
