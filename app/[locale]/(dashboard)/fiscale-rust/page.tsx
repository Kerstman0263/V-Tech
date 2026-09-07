import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { FiscaleRust } from "@/components/fiscale-rust/FiscaleRust";

/**
 * Belastingreservering — rechtsvorm-bewust:
 * - zzp / eenmanszaak / vof: btw + inkomstenbelasting + Zvw
 * - bv: btw + vennootschapsbelasting (geen Zvw), met DGA-loon als aandachtspunt
 */
export default async function FiscaleRustPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations("fiscaleRust");
  const { locale } = await params;
  const user = await requireUser();

  const [company, settings] = await Promise.all([
    db.company.findUnique({ where: { userId: user.accountId }, select: { accountType: true, legalForm: true } }),
    db.invoiceSettings.findUnique({ where: { userId: user.accountId }, select: { korEnabled: true } }),
  ]);
  const mode = company?.legalForm === "BV" ? "vpb" : "ib";

  return (
    <div>
      <PageHeader title={mode === "vpb" ? t("titleVpb") : t("title")} subtitle={mode === "vpb" ? t("subtitleVpb") : t("subtitle")} />
      <FiscaleRust locale={locale} kor={settings?.korEnabled ?? false} mode={mode} />
    </div>
  );
}
