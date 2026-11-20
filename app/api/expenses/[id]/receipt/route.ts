import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { receiptFileFromDataUrl } from "@/lib/receipt-file";

/**
 * GET /api/expenses/:id/receipt — het bonnetje van één uitgave.
 *
 * De uitgavenlijst stuurt alleen mee óf er een bonnetje is; het bestand zelf
 * komt hier vandaan, per uitgave. Zelfde veilige headers als
 * /api/inbox/[id]/file: het echte type uit de bytes, geen sniffing, geen cache,
 * en een sandbox voor het geval iemand het los opent. Een foto mag inline
 * (voor de voorvertoning), een pdf altijd als download.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const expense = await db.expense.findFirst({ where: { id, userId: user.accountId }, select: { id: true, receipt: true } });
    if (!expense?.receipt) return new Response(null, { status: 404 });
    const file = receiptFileFromDataUrl(expense.receipt);
    if (!file) return new Response(null, { status: 422 });
    const disposition = file.inline ? "inline" : "attachment";
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `${disposition}; filename="bonnetje-${expense.id.slice(-8)}.${file.extension}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
