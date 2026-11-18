import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { EXPORT_GUARANTEE_PATH } from "@/lib/export-guarantee";

/**
 * Korte regel bij de pakketten: in elk pakket kun je alles exporteren
 * (app/api/account/export/route.ts kent geen plan- of abonnementscontrole), met een link naar
 * /exportgarantie. Werkt in server- en clientcomponenten.
 *
 * audience "business": bedrijven hebben geen gratis pakket (lib/subscription.ts), dus daar
 * noemt de regel de proefperiode in plaats van "ook gratis".
 */
export function ExportGuaranteeNote({
  className,
  align = "center",
  audience = "zzp",
}: {
  className?: string;
  align?: "center" | "start";
  audience?: "zzp" | "business";
}) {
  const t = useTranslations("pricing");
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm leading-relaxed text-slate-400",
        align === "center" ? "mx-auto max-w-2xl justify-center text-center" : "text-left",
        className,
      )}
    >
      <Icon name="download" className="mt-0.5 h-4 w-4 shrink-0 text-saldova-licht" />
      <span>
        <span className="font-semibold text-slate-200">{t("exportGuaranteeTitle")}</span> {t(audience === "business" ? "exportGuaranteeBusiness" : "exportGuarantee")}{" "}
        <Link
          href={EXPORT_GUARANTEE_PATH}
          className="rounded font-semibold text-saldova-licht underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht"
        >
          {t("exportGuaranteeLink")} →
        </Link>
      </span>
    </p>
  );
}
