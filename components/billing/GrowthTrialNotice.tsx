import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** Anker van het abonnementsblok op /settings (components/settings/BillingPanel.tsx). */
export const BILLING_ANCHOR = "abonnement";

/**
 * Rustige melding voor zzp- en webshop-accounts in hun Groei-proef
 * (lib/subscription.ts -> soloTrialActive). Geen alarmkleur: na de proef
 * gaat het account gewoon door op Gratis, er wordt niets geblokkeerd.
 * Werkt in server- en clientcomponenten.
 */
export function GrowthTrialNotice({ daysLeft, className }: { daysLeft: number; className?: string }) {
  const t = useTranslations("appExtra.growthTrial");
  const tp = useTranslations("pricing");
  const days = Math.max(1, daysLeft);
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-rand bg-kaart px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5",
        className,
      )}
    >
      <p className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-300">
        <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 text-saldova-licht" />
        <span>
          <span className="font-semibold text-white">{t("title", { days })}</span>{" "}
          {t("body", { free: tp("plans.free.name") })}
        </span>
      </p>
      <Link href={`/settings#${BILLING_ANCHOR}`} className={cn(buttonClass("primary"), "min-h-11 shrink-0 sm:min-h-0")}>
        {t("cta")}
      </Link>
    </div>
  );
}
