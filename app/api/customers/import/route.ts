import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { encrypt } from "@/lib/encryption";
import { assertCan } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { customerKey, IMPORT_MAX_BYTES, parseCustomerCsv } from "@/lib/customer-import";
import { remainingCustomerSlots } from "@/lib/plan-limits";
import { serializableTransaction } from "@/lib/transaction";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    rateLimit(`customer-import:${user.accountId}`, 20, 60 * 60 * 1000);
    const body = await req.json();
    if (typeof body?.csv !== "string" || !body.csv.trim()) {
      return NextResponse.json({ error: "empty" }, { status: 422 });
    }
    if (Buffer.byteLength(body.csv, "utf8") > IMPORT_MAX_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    let parsed;
    try {
      parsed = parseCustomerCsv(body.csv);
    } catch (error) {
      const code = error instanceof Error && error.message === "too_many_rows" ? "too_many_rows" : "invalid_csv";
      return NextResponse.json({ error: code }, { status: 422 });
    }
    if (!parsed) return NextResponse.json({ error: "no_name_column" }, { status: 422 });
    const { rows, skipped, vatCleared, mapped } = parsed;
    const dryRun = body.dryRun !== false;
    const result = await serializableTransaction(async (tx) => {
      // Duplicates, plan capacity and the write share one serializable snapshot.
      const existing = await tx.customer.findMany({ where: { userId: user.accountId }, select: { name: true, email: true } });
      const seen = new Set(existing.map(customerKey));
      const unique = rows.filter((row) => {
        const key = customerKey(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const slots = await remainingCustomerSlots(user.accountId, tx);
      const fresh = slots === null ? unique : unique.slice(0, slots);
      const summary = {
        total: rows.length + skipped.length,
        toImport: fresh.length,
        duplicates: rows.length - unique.length,
        skipped: skipped.length,
        skippedRows: skipped.slice(0, 10),
        // Btw-nummer zonder landcode: klant wel ingelezen, nummer niet.
        vatCleared: vatCleared.length,
        vatClearedLines: vatCleared.slice(0, 10),
        mapped,
        overLimit: unique.length - fresh.length,
        preview: fresh.slice(0, 5).map(({ name, email, city }) => ({ name, email, city })),
      };
      if (dryRun || fresh.length === 0) return { ...summary, imported: 0 };
      const created = await tx.customer.createMany({ data: fresh.map((row) => ({ ...row, userId: user.accountId, address: encrypt(row.address) })) });
      await tx.auditLog.create({ data: { accountId: user.accountId, actorId: user.id, actorName: user.name || user.email || "gebruiker", action: "customers.imported", target: `${created.count} klanten` } });
      return { ...summary, imported: created.count };
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
