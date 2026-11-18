import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { documentMime } from "@/lib/document-file";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(); assertCan(user, "financials");
    const { id } = await params;
    const item = await db.inboxItem.findFirst({ where: { id, userId: user.accountId } });
    if (!item) return new Response(null, { status: 404 });
    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(item.data);
    const bytes = match ? Buffer.from(match[1], "base64") : Buffer.alloc(0);
    // Existing email attachments can be larger than the interactive upload limit.
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return new Response(null, { status: 422 });
    const mime = documentMime(bytes, 5 * 1024 * 1024) ?? "application/octet-stream";
    const filename = encodeURIComponent(item.fileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16)}`);
    return new Response(bytes, { headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${filename}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return errorResponse(error); }
}
