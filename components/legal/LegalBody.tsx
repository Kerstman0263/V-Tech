import { useLocale } from "next-intl";
import { legalContent } from "@/lib/legal/content";

// Rendert één juridisch document (privacy / voorwaarden / verwerkersovereenkomst)
// uit lib/legal/content.ts binnen de prose-opmaak van LegalPage.
export function LegalBody({ doc }: { doc: "privacy" | "terms" | "dpa" }) {
  const locale = useLocale();
  const content = legalContent(locale)[doc];
  return (
    <>
      <p>{content.intro}</p>
      <div className="not-prose mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <p className="text-sm leading-relaxed text-slate-400">{content.notice}</p>
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
