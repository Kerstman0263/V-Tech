import { cn, formatMoney } from "@/lib/utils";

export interface CustomerShare {
  name: string;
  amount: number;
}

const BARS = [
  "from-brand-500 to-fuchsia-400",
  "from-teal-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-sky-500 to-indigo-400",
];

/**
 * Top-klanten op omzet: rangschikking met aandeelbalk en percentage.
 * Maakt in één oogopslag zichtbaar hoe afhankelijk je van één klant bent.
 */
export function TopCustomers({
  customers,
  locale,
  emptyLabel,
}: {
  customers: CustomerShare[];
  locale: string;
  emptyLabel: string;
}) {
  if (customers.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }

  const total = customers.reduce((s, c) => s + c.amount, 0) || 1;
  const max = Math.max(...customers.map((c) => c.amount), 1);

  return (
    <ul className="flex flex-col gap-3.5">
      {customers.map((c, i) => (
        <li key={c.name} className="group">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="tabular w-4 shrink-0 text-xs font-semibold text-slate-600">{i + 1}</span>
              <span className="truncate text-sm font-medium text-slate-200">{c.name}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="tabular text-xs text-slate-500">{Math.round((c.amount / total) * 100)}%</span>
              <span className="tabular text-sm font-semibold text-white">{formatMoney(c.amount, locale)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700 group-hover:brightness-125", BARS[i % BARS.length])}
              style={{ width: `${Math.max((c.amount / max) * 100, 4)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
