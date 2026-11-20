import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * Korte regel bij de zzp-pakketten en op de registratiepagina: nieuwe zzp- en
 * webshop-accounts krijgen 30 dagen Groei gratis (app/api/register/route.ts ->
 * soloTrialSubscription), zonder creditcard: registreren vraagt alleen e-mail en
 * wachtwoord. Daarna gelden vanzelf de gratis limieten (lib/subscription.ts ->
 * effectivePlan). Bewust geen belofte over online doorbetalen: dat kan pas na de
 * lancering (lib/company.ts -> isLaunched). Werkt in server- en clientcomponenten.
 *
 * `moreHref`: waar geen Groei-kaart in de buurt staat (homepage), een link naar
 * de pakketten waar Groei wel staat, bijvoorbeeld "/zzp#pricing".
 */
export function GrowthTrialNote({
  className,
  align = "center",
  variant = "plain",
  moreHref,
}: {
  className?: string;
  align?: "center" | "start";
  /** "plain": tekstregel bij de prijzen; "box": kaartje in een formulier. */
  variant?: "plain" | "box";
  /** Optionele link naar de pakketten waar Groei te zien is. */
  moreHref?: string;
}) {
  const t = useTranslations("pricing");
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm leading-relaxed",
        variant === "box" ? "rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-2 text-xs text-brand-100" : "text-slate-300",
        align === "center" ? "mx-auto max-w-2xl justify-center text-center" : "text-left",
        className,
      )}
    >
      <Icon name="sparkles" className={cn("mt-0.5 shrink-0 text-saldova-licht", variant === "box" ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <span>
        {t("growthTrial")}
        {moreHref && (
          <>
            {" "}
            <Link
              href={moreHref}
              className="rounded font-semibold text-saldova-licht underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht"
            >
              {t("growthTrialLink")}
            </Link>
          </>
        )}
      </span>
    </p>
  );
}
