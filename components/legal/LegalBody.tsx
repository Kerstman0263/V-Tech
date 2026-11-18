import { useLocale, useTranslations } from "next-intl";
import { legalContent } from "@/lib/legal/content";
import { CompanyDetails } from "@/components/company/CompanyDetails";

// Rendert één juridisch document (privacy / voorwaarden / verwerkersovereenkomst)
// uit lib/legal/content.ts binnen de prose-opmaak van LegalPage.
// Bovenaan staan de gegevens van Saldova als contractpartij (lib/company.ts); zolang Saldova
// in oprichting is, staat de melding van het document in dezelfde kaart.
export function LegalBody({ doc }: { doc: "privacy" | "terms" | "dpa" }) {
  const locale = useLocale();
  const t = useTranslations("companyInfo");
  const content = legalContent(locale)[doc];
  return (
    <>
      <p>{content.intro}</p>
      <div className="not-prose mt-6">
        <CompanyDetails title={t("legalTitle")} notice={content.notice} showPrivacyEmail={doc === "privacy"} />
      </div>
      {content.sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          {s.p?.map((para) => <p key={para}>{para}</p>)}
          {s.ul && (
            <ul>
              {s.ul.map((li) => <li key={li}>{li}</li>)}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
