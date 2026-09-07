import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { importBankSchema } from "@/lib/validations/bank";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// POST /api/bank/import — banktransacties inlezen, ontdubbelen en binnenkomende
// betalingen automatisch koppelen aan openstaande facturen (suggestie).
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;

    const parsed = importBankSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const txs = parsed.data.transactions;

    // Openstaande facturen voor auto-matching.
    const openInvoices = await db.invoice.findMany({
      where: { userId, status: { in: ["SENT", "OVERDUE"] } },
      select: { id: true, invoiceNumber: true, total: true },
    });
    const invMatch = openInvoices.map((i) => ({ id: i.id, num: norm(i.invoiceNumber), total: Number(i.total) }));

    function suggest(tx: { amount: number; description: string; direction: string }): string | null {
      if (tx.direction !== "CREDIT") return null;
      const d = norm(tx.description);
      // 1) Factuurnummer in de omschrijving = sterke match.
      const byNumber = invMatch.find((i) => i.num.length >= 4 && d.includes(i.num));
      if (byNumber) return byNumber.id;
      // 2) Exact bedrag — alleen als er precies één openstaande factuur op past.
      const byAmount = invMatch.filter((i) => Math.abs(i.total - tx.amount) < 0.005);
      if (byAmount.length === 1) return byAmount[0].id;
      return null;
    }

    let suggested = 0;
    const rows = txs.map((tx) => {
      const dedupeHash = crypto.createHash("sha256").update(`${tx.date}|${tx.amount}|${tx.direction}|${tx.description}`).digest("hex");
      const suggestedInvoiceId = suggest(tx);
      if (suggestedInvoiceId) suggested++;
      return {
        userId,
        createdById: user.id,
        date: new Date(`${tx.date}T00:00:00Z`),
        amount: tx.amount,
        direction: tx.direction,
        description: tx.description,
        suggestedInvoiceId,
        dedupeHash,
      };
    });

    // Ontdubbelen via de unique [userId, dedupeHash].
    const result = await db.bankTransaction.createMany({ data: rows, skipDuplicates: true });

    return NextResponse.json({
      imported: result.count,
      duplicates: rows.length - result.count,
      suggested,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
