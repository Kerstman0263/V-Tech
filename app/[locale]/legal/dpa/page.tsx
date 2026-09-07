import { useTranslations } from "next-intl";
import { LegalPage } from "@/components/legal/LegalPage";

export default function DpaPage() {
  const t = useTranslations("legal");
  return (
    <LegalPage title={t("dpa.title")} updatedLabel={t("updated")}>
      <p>{t("dpa.intro")}</p>
      <div className="mt-8 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-5 not-prose">
        <p className="text-sm text-slate-400">{t("placeholder")}</p>
      </div>
    </LegalPage>
  );
}
