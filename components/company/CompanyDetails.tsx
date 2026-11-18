import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  COMPANY,
  compactPendingNotes,
  formatAddress,
  isRegistered,
  pendingMessageKey,
  privacyContactEmail,
  type CompanyInfo,
  type RequiredCompanyField,
} from "@/lib/company";

/**
 * Bedrijfsgegevens van Saldova (uit lib/company.ts). Ingevulde velden staan er gewoon; wat nog
 * ontbreekt krijgt een eerlijke regel ("Volgt na inschrijving bij de KvK"), nooit een nepwaarde.
 *
 *  - variant="compact": één of twee regels kleine tekst, voor de footer.
 *  - variant="full": kaart met alle gegevens, voor /contact en de juridische documenten.
 *
 * Werkt in server- en clientcomponenten.
 */
export function CompanyDetails({
  variant = "full",
  title,
  notice,
  light = false,
  showPrivacyEmail = false,
  className,
  info = COMPANY,
}: {
  variant?: "compact" | "full";
  /** Kop boven de kaart (alleen bij "full"). */
  title?: string;
  /** Extra uitleg in de kaart, bv. de "in oprichting"-melding van een juridisch document. */
  notice?: string | null;
  /** Licht thema (home-footer). */
  light?: boolean;
  /** Toon ook het e-mailadres voor privacyvragen (privacyverklaring). */
  showPrivacyEmail?: boolean;
  className?: string;
  info?: CompanyInfo;
}) {
  const t = useTranslations("companyInfo");
  const registered = isRegistered(info);
  const name = registered ? info.tradeName : `${info.tradeName} (${t("inFormation")})`;
  const legalForm = info.legalForm ? t(`legalForms.${info.legalForm}`) : null;
  const address = info.address ? formatAddress(info.address) : null;
  const linkClass = cn(
    "underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saldova-licht",
    light ? "text-slate-700 hover:text-slate-900" : "text-saldova-licht hover:text-white",
  );
  const mail = (email: string) => (
    <a href={`mailto:${email}`} className={linkClass}>
      {email}
    </a>
  );

  if (variant === "compact") {
    const parts: React.ReactNode[] = [
      name,
      legalForm,
      info.ownerName,
      address,
      info.kvkNumber ? t("compactKvk", { number: info.kvkNumber }) : null,
      info.vatId ? t("compactVat", { number: info.vatId }) : null,
      info.email ? mail(info.email) : null,
    ].filter((part) => part !== null && part !== "");
    const pending = compactPendingNotes(info);
    return (
      <div className={cn("text-xs leading-relaxed", className)}>
        <p>
          {parts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden> · </span>}
              {part}
            </span>
          ))}
        </p>
        {pending.length > 0 && (
          <p className="mt-1">{pending.map((key) => t(pendingMessageKey(key, info, true))).join(" ")}</p>
        )}
      </div>
    );
  }

  const pendingValue = (field: RequiredCompanyField) => (
    <span className={light ? "text-slate-500" : "text-slate-400"}>{t(pendingMessageKey(field, info))}</span>
  );
  const privacyEmail = privacyContactEmail(info);

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: t("tradeName"), value: name },
    ...(legalForm ? [{ label: t("legalForm"), value: legalForm }] : []),
    ...(info.ownerName ? [{ label: t("owner"), value: info.ownerName }] : []),
    { label: t("address"), value: address ?? pendingValue("address") },
    { label: t("kvk"), value: info.kvkNumber ?? pendingValue("kvkNumber") },
    { label: t("vat"), value: info.vatId ?? pendingValue("vatId") },
    { label: t("email"), value: info.email ? mail(info.email) : pendingValue("email") },
    ...(showPrivacyEmail && privacyEmail && privacyEmail !== info.email
      ? [{ label: t("privacyEmail"), value: mail(privacyEmail) }]
      : []),
  ];

  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      {title && <h2 className="text-base font-semibold text-white">{title}</h2>}
      {notice && <p className={cn("text-sm leading-relaxed text-slate-400", title && "mt-2")}>{notice}</p>}
      <dl className={cn("grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]", (title || notice) && "mt-4")}>
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-slate-400">{row.label}</dt>
            <dd className="mb-2 text-slate-200 sm:mb-0">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
