import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamManager } from "@/components/team/TeamManager";
import { can } from "@/lib/permissions";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations("team");
  const user = await requireUser();
  const { locale } = await params;

  // Eigenaar én leidinggevende hebben toegang tot teambeheer
  const canManage = can(user, "manageTeam");
  if (!canManage) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <TeamManager />
    </div>
  );
}
