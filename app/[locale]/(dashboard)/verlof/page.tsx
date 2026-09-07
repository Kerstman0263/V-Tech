import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { LeaveManager } from "@/components/leave/LeaveManager";

// Verlofbeheer — alleen voor BEDRIJF-accounts (werkgever + medewerkers).
export default async function LeavePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations("leave");
  const user = await requireUser();
  const { locale } = await params;

  // Platformbeheerders (OWNER/ADMIN) mogen altijd kijken.
  const isPlatformAdmin = user.role === "ADMIN" || user.role === "OWNER";
  const company = await db.company.findUnique({ where: { userId: user.accountId } });
  if ((company?.accountType ?? "ZZP") !== "BEDRIJF" && !isPlatformAdmin) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <LeaveManager />
    </div>
  );
}
