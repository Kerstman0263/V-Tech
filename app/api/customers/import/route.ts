import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { can } from "@/lib/permissions";
import { logAccount } from "@/lib/audit";
import { rateLimitResponse } from "@/lib/rate-limit";
import { customerKey, IMPORT_MAX_BYTES, parseCustomerCsv } from "@/lib/customer-import";
import { remainingCustomerSlots } from "@/lib/plan-limits";

/**
 * POST /api/customers/import — { csv, dryRun }.
 * dryRun=true geeft alleen een preview (aantallen, herkende kolommen, eerste
 * regels). Bij importeren worden bestaande klanten (zelfde e-mail, of zelfde
 * naam zonder e-mail) overgeslagen, zodat opnieuw importeren veilig is.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user, "financials")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const accountId = session.user.accountId;

  const limited = rateLimitResponse(`customer-import:${accountId}`, 20, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { csv?: unknown; dryRun?: unknown } | null;
  if (typeof body?.csv !== "string" || !body.csv.trim()) {
    return NextResponse.json({ error: "empty" }, { status: 422 });
  }
  if (body.csv.length > IMPORT_MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  let parsed;
  try {
    parsed = parseCustomerCsv(body.csv);
  } catch {
    parsed = null;
  }
  if (!parsed) return NextResponse.json({ error: "no_name_column" }, { status: 422 });

  const existing = await db.customer.findMany({ where: { userId: accountId }, select: { name: true, email: true } });
  const seen = new Set(existing.map(customerKey));
  const fresh = parsed.rows.filter((row) => {
    const key = customerKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Gratis-plan: niet meer importeren dan er nog plek is (de rest blijft over).
  const slots = await remainingCustomerSlots(accountId);
  const overLimit = slots !== null && fresh.length > slots ? fresh.length - slots : 0;
  if (overLimit) fresh.splice(slots!);
  const summary = {
    total: parsed.rows.length + parsed.skipped.length,
    toImport: fresh.length,
    duplicates: parsed.rows.length - fresh.length,
    skipped: parsed.skipped.length,
    mapped: parsed.mapped,
    overLimit,
    preview: fresh.slice(0, 5).map(({ name, email, city }) => ({ name, email, city })),
  };
  if (body.dryRun !== false) return NextResponse.json({ ...summary, imported: 0 });

  const { count } = await db.customer.createMany({
    data: fresh.map((row) => ({
      userId: accountId,
      name: row.name,
      email: row.email,
      address: encrypt(row.address), // AVG: versleuteld opslaan
      postalCode: row.postalCode,
      city: row.city,
      country: row.country,
      vatNumber: row.vatNumber,
    })),
  });
  logAccount(accountId, { id: session.user.id, name: session.user.name, email: session.user.email }, "customers.imported", `${count} klanten`);

  return NextResponse.json({ ...summary, imported: count });
}
