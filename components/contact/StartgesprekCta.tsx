import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/ui/Button";
import { STARTGESPREK_HREF, STARTGESPREK_MINUTES } from "@/lib/contact-topics";
import { cn } from "@/lib/utils";

/**
 * Knop "Plan een gratis startgesprek" met korte uitleg. Er is geen
 * agenda-koppeling: de knop opent het contactformulier met onderwerp
 * "Startgesprek" vooraf ingevuld en de eigenaar plant het gesprek daarna zelf in.
 *
 * - card: losse kaart met titel, uitleg en witte knop (zzp, overstappen, app).
 * - row: smalle regel met uitleg en knop naast elkaar (onder de prijzen).
 */
export function StartgesprekCta({ variant = "card", className }: { variant?: "card" | "row"; className?: string }) {
  const t = useTranslations("startgesprek");
  const minutes = STARTGESPREK_MINUTES;

  if (variant === "row") {
    return (
      <div className={cn("flex flex-col gap-4 rounded-2xl border border-rand bg-kaart px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6", className)}>
        <div className="flex items-start gap-3">
          <span className="inline-flex shrink-0 rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
            <Icon name="calendar" className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-white">{t("title", { minutes })}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{t("text")}</p>
          </div>
        </div>
        <Link href={STARTGESPREK_HREF} className={cn(buttonClass("primary"), "w-full shrink-0 sm:w-auto")}>
          {t("button")}
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-rand bg-kaart p-6", className)}>
      <span className="inline-flex rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
        <Icon name="calendar" className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-lg font-semibold text-white">{t("title", { minutes })}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{t("text")}</p>
      <Link href={STARTGESPREK_HREF} className={cn(buttonClass("primary"), "mt-5 w-full sm:w-auto")}>
        {t("button")}
      </Link>
    </div>
  );
}
