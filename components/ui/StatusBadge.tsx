import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELED";

const styles: Record<InvoiceStatus, string> = {
  DRAFT: "bg-white/10 text-slate-400",
  SENT: "bg-blue-500/15 text-blue-300",
  PAID: "bg-emerald-500/15 text-emerald-300",
  OVERDUE: "bg-rose-500/15 text-rose-300",
  CANCELED: "bg-white/5 text-slate-500 line-through",
};

const dot: Record<InvoiceStatus, string> = {
  DRAFT: "bg-slate-400",
  SENT: "bg-blue-500",
  PAID: "bg-emerald-500",
  OVERDUE: "bg-rose-500",
  CANCELED: "bg-slate-300",
};

// Gekleurde status-pill voor facturen.
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const t = useTranslations("invoices.status");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        styles[status],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot[status])} />
      {t(status.toLowerCase())}
    </span>
  );
}

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CONVERTED";

const quoteStyles: Record<QuoteStatus, string> = {
  DRAFT: "bg-white/10 text-slate-400",
  SENT: "bg-blue-500/15 text-blue-300",
  ACCEPTED: "bg-emerald-500/15 text-emerald-300",
  DECLINED: "bg-rose-500/15 text-rose-300",
  EXPIRED: "bg-amber-500/15 text-amber-300",
  CONVERTED: "bg-brand-500/15 text-brand-300",
};

const quoteDot: Record<QuoteStatus, string> = {
  DRAFT: "bg-slate-400",
  SENT: "bg-blue-500",
  ACCEPTED: "bg-emerald-500",
  DECLINED: "bg-rose-500",
  EXPIRED: "bg-amber-500",
  CONVERTED: "bg-brand-500",
};

// Gekleurde status-pill voor offertes.
export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const t = useTranslations("quotes.status");
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", quoteStyles[status])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", quoteDot[status])} />
      {t(status.toLowerCase())}
    </span>
  );
}
