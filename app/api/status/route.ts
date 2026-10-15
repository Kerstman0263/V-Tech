import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FISCAL_YEARS } from "@/lib/fiscal-rates";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/status — publieke, échte statuscheck voor de hulp-widget.
// Alleen wat we werkelijk meten: bereikt de app de database, en voor welke
// jaren staan geverifieerde belastingtarieven klaar. Geen verzonnen groen licht.
export async function GET(req: Request) {
  const limited = rateLimitResponse(`status:${clientIp(req)}`, 30, 60 * 1000);
  if (limited) return limited;

  let database: "ok" | "down" = "ok";
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
  } catch {
    database = "down";
  }

  return NextResponse.json(
    { app: database, fiscalYears: [...FISCAL_YEARS], checkedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
