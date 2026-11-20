import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/Button";
import type { MissingSenderField } from "@/lib/invoice-sender";

export type { MissingSenderField };

/**
 * Melding als de verplichte afzendergegevens op een factuur ontbreken
 * (bedrijfsnaam, adres, btw-nummer en KvK-nummer; geen btw-nummer bij de KOR). Versturen
 * kan pas als ze er zijn; een concept bewaren en de PDF bekijken kan gewoon.
 * Met `automatic` staat er ook bij dat automatische facturen (aanbetaling na een
 * online geaccepteerde offerte, periodieke facturen) dan niet worden gemaild.
 */
export function SenderDetailsNotice({ missing, className, automatic = false }: { missing: MissingSenderField[]; className?: string; automatic?: boolean }) {
  const t = useTranslations("appExtra.senderDetails");
  if (missing.length === 0) return null;
  return (
    <div role="status" className={cn("rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm", className)}>
      <div className="flex items-start gap-3">
        <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-100">{t("title")}</p>
          <p className="mt-1 leading-relaxed text-slate-300">{t("body")}</p>
          {automatic && <p className="mt-2 leading-relaxed text-slate-300">{t("automatic")}</p>}
          <p className="mt-2 text-slate-300">
            {t("missing")}{" "}
            <span className="font-medium text-white">{missing.map((field) => t(`fields.${field}`)).join(", ")}</span>
          </p>
          <Link
            href="/settings"
            className={cn(buttonClass("primary"), "mt-3 min-h-11")}
          >
            {t("cta")}
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
