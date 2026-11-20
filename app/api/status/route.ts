import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FISCAL_YEARS } from "@/lib/fiscal-rates";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { serverRegion } from "@/lib/security-page";

export const dynamic = "force-dynamic";

// GET /api/status — publieke, échte statuscheck voor de hulp-widget.
// Alleen wat we werkelijk meten: bereikt de app de database, voor welke jaren
// staan geverifieerde belastingtarieven klaar, en in welke Vercel-regio draait
// deze server (VERCEL_REGION, door Vercel gezet). Geen verzonnen groen licht.
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
    { app: database, fiscalYears: [...FISCAL_YEARS], server: serverRegion(process.env.VERCEL_REGION), checkedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
