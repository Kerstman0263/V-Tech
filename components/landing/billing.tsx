import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatPlanPrice } from "@/lib/marketing";

/**
 * Prijsweergave van de marketingsite. Er is alleen maandbetaling: de prijs staat
 * als "€ 29" met "per maand, excl. btw" eronder. Werkt in server- en clientcomponenten.
 */
export function PlanPrice({
  amount,
  className,
  noteClassName,
}: {
  amount: number;
  className?: string;
  noteClassName?: string;
}) {
  const t = useTranslations("pricing");
  return (
    <div>
      <p className={cn("tabular text-4xl font-extrabold tracking-tight text-white", className)}>{formatPlanPrice(amount)}</p>
      <p className={cn("mt-1 text-sm text-slate-400", noteClassName)}>{t("perMonthExcl")}</p>
    </div>
  );
}

/** Korte uitleg onder de prijzen: betaalde plannen komen bij de lancering, je begint gratis. */
export function LaunchNote({ className }: { className?: string }) {
  const t = useTranslations("pricing");
  return <p className={cn("mx-auto max-w-2xl text-center text-sm text-slate-400", className)}>{t("launchNote")}</p>;
}
