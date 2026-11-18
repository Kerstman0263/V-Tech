import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { documentMime, MAX_DOCUMENT_BYTES } from "@/lib/document-file";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    rateLimit(`document-upload:${user.accountId}`, 60, 60 * 60 * 1000);
    if (Number(req.headers.get("content-length")) > MAX_DOCUMENT_BYTES + 100_000) return NextResponse.json({ error: "Bestand te groot (maximaal 2 MB)." }, { status: 413 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "Kies een PDF, PNG, JPEG of WebP van maximaal 2 MB." }, { status: 422 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = documentMime(bytes);
    if (!mimeType) return NextResponse.json({ error: "Het bestandstype wordt niet ondersteund." }, { status: 422 });
    const item = await db.inboxItem.create({ data: { userId: user.accountId, fromEmail: user.email ?? "", subject: null, fileName: file.name.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 160) || "document", mimeType, size: bytes.length, data: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}` }, select: { id: true } });
    return NextResponse.json(item, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

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
    return NextResponse.json(items, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
