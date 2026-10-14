import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { overviewQuerySchema } from "@/lib/validations/webshop";
import { dailyTotals, ossSummary, periodTotals, quarterRange } from "@/lib/webshop/oss";

// GET /api/webshop/overview?year=2026&quarter=3 — omzet, btw per land (OSS),
// dagtotalen. quarter=0 = heel jaar. Alleen EUR-bedragen tellen mee.
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const url = new URL(req.url);
    const parsed = overviewQuerySchema.safeParse({
      year: url.searchParams.get("year") ?? new Date().getFullYear(),
      quarter: url.searchParams.get("quarter") ?? 0,
    });
    if (!parsed.success) throw new HttpError(422, "Kies een geldig jaar en kwartaal.");
    const { year, quarter } = parsed.data;

    const rows = await db.webshopOrder.findMany({
      where: { userId: user.accountId, orderDate: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } },
      select: { kind: true, orderDate: true, country: true, currency: true, totalGross: true, vatAmount: true, fees: true, isBusiness: true, connection: { select: { name: true } } },
      take: 50_000,
    });
    const otherCurrency = rows.filter((r) => r.currency !== "EUR").length;
    const orders = rows
      .filter((r) => r.currency === "EUR")
      .map((r) => ({
        kind: r.kind,
        orderDate: r.orderDate.toISOString().slice(0, 10),
        country: r.country,
        totalGross: Number(r.totalGross),
        vatAmount: Number(r.vatAmount),
        fees: Number(r.fees),
        isBusiness: r.isBusiness,
        source: r.connection.name,
      }));

    const period: [string, string] = quarter ? quarterRange(year, quarter as 1 | 2 | 3 | 4) : [`${year}-01-01`, `${year + 1}-01-01`];
    const inPeriod = orders.filter((o) => o.orderDate >= period[0] && o.orderDate < period[1]);

    const perSource = new Map<string, { source: string; orders: number; gross: number }>();
    for (const o of inPeriod) {
      const s = perSource.get(o.source) ?? { source: o.source, orders: 0, gross: 0 };
      if (o.kind === "SALE") { s.orders++; s.gross += o.totalGross; } else { s.gross -= o.totalGross; }
      perSource.set(o.source, s);
    }

    return NextResponse.json({
      year,
      quarter,
      totals: periodTotals(orders, period[0], period[1]),
      oss: ossSummary(orders, year, period),
      days: dailyTotals(inPeriod, 31),
      sources: [...perSource.values()].map((s) => ({ ...s, gross: Math.round(s.gross * 100) / 100 })).sort((a, b) => b.gross - a.gross),
      otherCurrency,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
