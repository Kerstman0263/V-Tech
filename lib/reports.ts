/**
 * Rapportages — pure berekeningen op factuur- en uitgavendata (factuurbasis,
 * bedragen excl. btw). Geen database: goed testbaar en hergebruikbaar.
 */
export interface ReportInvoice {
  issueDate: Date;
  dueDate: Date | null;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELED";
  subtotal: number;
  vatAmount: number;
  total: number;
  customerName: string;
}

export interface ReportExpense {
  date: Date;
  amountGross: number;
  vatAmount: number;
  category: string;
}

export interface MonthRow {
  month: number; // 1..12
  revenue: number;
  costs: number;
  depreciation: number;
  result: number;
}

export interface Report {
  year: number;
  totals: { revenue: number; costs: number; depreciation: number; result: number; vatOwed: number; vatInput: number; vatBalance: number; margin: number | null };
  monthly: MonthRow[];
  byCustomer: { name: string; revenue: number; invoices: number; share: number }[];
  byCategory: { category: string; net: number; share: number }[];
  aging: { current: number; d30: number; d60: number; d90: number; openCount: number; openTotal: number };
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const COUNTS_AS_REVENUE = new Set(["SENT", "PAID", "OVERDUE"]);

export function buildReport(
  year: number,
  invoices: ReportInvoice[],
  expenses: ReportExpense[],
  depreciationByMonth: number[],
  now: Date = new Date(),
): Report {
  const inYear = (d: Date) => d.getFullYear() === year;
  const rev = invoices.filter((i) => COUNTS_AS_REVENUE.has(i.status) && inYear(i.issueDate));
  const exp = expenses.filter((e) => inYear(e.date));

  const monthly: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, costs: 0, depreciation: depreciationByMonth[i] ?? 0, result: 0 }));
  for (const i of rev) monthly[i.issueDate.getMonth()].revenue += i.subtotal;
  for (const e of exp) monthly[e.date.getMonth()].costs += e.amountGross - e.vatAmount;
  for (const m of monthly) {
    m.revenue = r2(m.revenue);
    m.costs = r2(m.costs);
    m.result = r2(m.revenue - m.costs - m.depreciation);
  }

  const revenue = r2(monthly.reduce((s, m) => s + m.revenue, 0));
  const costs = r2(monthly.reduce((s, m) => s + m.costs, 0));
  const depreciation = r2(monthly.reduce((s, m) => s + m.depreciation, 0));
  const result = r2(revenue - costs - depreciation);
  const vatOwed = r2(rev.reduce((s, i) => s + i.vatAmount, 0));
  const vatInput = r2(exp.reduce((s, e) => s + e.vatAmount, 0));

  // Omzet per klant (top 10)
  const custMap = new Map<string, { revenue: number; invoices: number }>();
  for (const i of rev) {
    const c = custMap.get(i.customerName) ?? { revenue: 0, invoices: 0 };
    c.revenue += i.subtotal;
    c.invoices += 1;
    custMap.set(i.customerName, c);
  }
  const byCustomer = [...custMap.entries()]
    .map(([name, c]) => ({ name, revenue: r2(c.revenue), invoices: c.invoices, share: revenue > 0 ? r2((c.revenue / revenue) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Kosten per categorie
  const catMap = new Map<string, number>();
  for (const e of exp) catMap.set(e.category, (catMap.get(e.category) ?? 0) + (e.amountGross - e.vatAmount));
  const byCategory = [...catMap.entries()]
    .map(([category, net]) => ({ category, net: r2(net), share: costs > 0 ? r2((net / costs) * 100) : 0 }))
    .sort((a, b) => b.net - a.net);

  // Ouderdom debiteuren (alle openstaande facturen, niet alleen dit jaar)
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, openCount: 0, openTotal: 0 };
  for (const i of invoices) {
    if (i.status !== "SENT" && i.status !== "OVERDUE") continue;
    aging.openCount += 1;
    aging.openTotal += i.total;
    const ref = i.dueDate ?? i.issueDate;
    const days = Math.floor((now.getTime() - ref.getTime()) / 86_400_000);
    if (days <= 0) aging.current += i.total;
    else if (days <= 30) aging.d30 += i.total;
    else if (days <= 60) aging.d60 += i.total;
    else aging.d90 += i.total;
  }
  for (const k of Object.keys(aging) as (keyof typeof aging)[]) aging[k] = r2(aging[k]);

  return {
    year,
    totals: { revenue, costs, depreciation, result, vatOwed, vatInput, vatBalance: r2(vatOwed - vatInput), margin: revenue > 0 ? r2((result / revenue) * 100) : null },
    monthly,
    byCustomer,
    byCategory,
    aging,
  };
}
