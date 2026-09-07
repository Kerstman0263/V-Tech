import { cn, formatMoney } from "@/lib/utils";

export interface AgingBucket {
  key: "current" | "d30" | "d60" | "d60plus";
  label: string;
  amount: number;
  count: number;
}

const STYLES: Record<AgingBucket["key"], { bar: string; dot: string }> = {
  current: { bar: "bg-gradient-to-r from-emerald-500 to-teal-500", dot: "bg-emerald-500" },
  d30: { bar: "bg-gradient-to-r from-amber-500 to-orange-500", dot: "bg-amber-500" },
  d60: { bar: "bg-gradient-to-r from-orange-500 to-rose-500", dot: "bg-orange-500" },
  d60plus: { bar: "bg-gradient-to-r from-rose-500 to-pink-500", dot: "bg-rose-500" },
};

/**
 * Ouderdomsanalyse van openstaande facturen: één gestapelde balk plus een
 * uitsplitsing per termijn. Laat in één blik zien hoe gezond de debiteuren zijn.
 */
export function AgingBreakdown({
  buckets,
  locale,
  total,
  emptyLabel,
}: {
  buckets: AgingBucket[];
  locale: string;
  total: number;
  emptyLabel: string;
}) {
  if (total <= 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }

  const visible = buckets.filter((b) => b.amount > 0);

  return (
    <div>
      {/* Gestapelde balk */}
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-white/[0.04]">
        {visible.map((b) => (
          <div
            key={b.key}
            title={`${b.label} — ${formatMoney(b.amount, locale)}`}
            className={cn("h-full rounded-full transition-all duration-700", STYLES[b.key].bar)}
            style={{ width: `${(b.amount / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Uitsplitsing */}
      <ul className="mt-4 flex flex-col gap-2.5">
        {buckets.map((b) => (
          <li key={b.key} className="flex items-center gap-3 text-sm">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", b.amount > 0 ? STYLES[b.key].dot : "bg-white/10")} />
            <span className={cn("flex-1 truncate", b.amount > 0 ? "text-slate-300" : "text-slate-600")}>{b.label}</span>
            <span className="tabular shrink-0 text-xs text-slate-500">{b.count}×</span>
            <span className={cn("tabular w-24 shrink-0 text-right font-semibold", b.amount > 0 ? "text-white" : "text-slate-600")}>
              {formatMoney(b.amount, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
