import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/auth-helpers";
import { sendMessageSchema } from "@/lib/validations/support";
import { setThreadStatus, notifyUserReply } from "@/lib/support";

// GET /api/admin/support/:userId — berichten + status (markeert klant-berichten gelezen)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdmin();
    const { userId } = await params;

    const [messages, thread] = await Promise.all([
      db.supportMessage.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.supportThread.findUnique({ where: { userId } }),
    ]);

    await db.supportMessage.updateMany({
      where: { userId, senderRole: "USER", readByAdmin: false },
      data: { readByAdmin: true },
    });

    return NextResponse.json({ messages, status: thread?.status ?? "OPEN" });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/admin/support/:userId — admin antwoordt (thread -> PENDING + e-mail klant)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdmin();
    const { userId } = await params;

    const parsed = sendMessageSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const target = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const message = await db.supportMessage.create({
      data: {
        userId,
        senderRole: "ADMIN",
        body: parsed.data.body,
        readByAdmin: true,
        readByUser: false,
      },
    });

    await setThreadStatus(userId, "PENDING");
    await notifyUserReply(target.email, parsed.data.body);

    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/admin/support/:userId — thread-status wijzigen (bv. afgehandeld)
const statusSchema = z.object({ status: z.enum(["OPEN", "PENDING", "RESOLVED"]) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdmin();
    const { userId } = await params;
    const parsed = statusSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige status" }, { status: 422 });
    }
    await setThreadStatus(userId, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
