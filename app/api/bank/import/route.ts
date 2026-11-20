import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { importBankSchema } from "@/lib/validations/bank";
import { openReceivableWhere } from "@/lib/invoice-credit";
import { bankDedupeKeys } from "@/lib/bank-parse";

/** Zoveel overgeslagen regels sturen we terug om te tonen. */
const MAX_SKIPPED_SHOWN = 50;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// POST /api/bank/import — banktransacties inlezen, ontdubbelen en binnenkomende
// betalingen automatisch koppelen aan openstaande facturen (suggestie).
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    // Bankgegevens inlezen valt onder "Bank & btw exporteren" (zie lib/permissions).
    assertCan(user, "exports");
    const userId = user.accountId;

    const parsed = importBankSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const txs = parsed.data.transactions;

    // Openstaande facturen voor auto-matching.
    const openInvoices = await db.invoice.findMany({
      // Gecrediteerde facturen en creditfacturen staan niet open (lib/invoice-credit.ts).
      where: { userId, ...openReceivableWhere },
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

    // Sleutel per regel; gelijke regels in één bestand krijgen een volgnummer
    // (lib/bank-parse.ts), zodat ze niet samenvallen.
    const keys = bankDedupeKeys(txs);
    const hashes = keys.map((k) => crypto.createHash("sha256").update(k).digest("hex"));

    // Welke regels stonden er al (eerdere import)? Die laten we zien.
    const existing = await db.bankTransaction.findMany({
      where: { userId, dedupeHash: { in: hashes } },
      select: { dedupeHash: true },
    });
    const existingSet = new Set(existing.map((e) => e.dedupeHash));

    let suggested = 0;
    const rows = txs.flatMap((tx, i) => {
      const dedupeHash = hashes[i];
      if (existingSet.has(dedupeHash)) return [];
      const suggestedInvoiceId = suggest(tx);
      if (suggestedInvoiceId) suggested++;
      return [{
        userId,
        createdById: user.id,
        date: new Date(`${tx.date}T00:00:00Z`),
        amount: tx.amount,
        direction: tx.direction,
        description: tx.description,
        suggestedInvoiceId,
        dedupeHash,
      }];
    });

    // Ontdubbelen via de unique [userId, dedupeHash] (vangt ook een gelijktijdige import af).
    const result = rows.length ? await db.bankTransaction.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
    const skipped = txs.filter((_, i) => existingSet.has(hashes[i]));

    return NextResponse.json({
      imported: result.count,
      duplicates: txs.length - result.count,
      suggested,
      skipped: skipped.slice(0, MAX_SKIPPED_SHOWN).map((tx) => ({ date: tx.date, amount: tx.amount, direction: tx.direction, description: tx.description })),
      skippedMore: Math.max(0, skipped.length - MAX_SKIPPED_SHOWN),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
