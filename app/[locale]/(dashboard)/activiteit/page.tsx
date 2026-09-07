import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { LogTable } from "@/components/logs/LogTable";

// Activiteitenlog van dit account (abonnement) — voor de eigenaar en
// leidinggevenden: wie deed wat, wanneer.
export default async function ActivityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations("logs");
  const user = await requireUser();
  const { locale } = await params;

  const isBoss = user.id === user.accountId || user.teamRole === "MANAGER";
  if (!isBoss) redirect(`/${locale}/dashboard`);

  const logs = await db.auditLog.findMany({
    where: { platform: false, accountId: user.accountId },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <div>
      <div data-tour="activity-intro">
        <PageHeader title={t("accountTitle")} subtitle={t("accountSubtitle")} />
      </div>
      <div data-tour="activity-log">
        <Card className="overflow-hidden">
          <div data-tour="activity-search">
            <LogTable
              logs={logs.map((l) => ({
                id: l.id,
                createdAt: l.createdAt.toISOString(),
                actorName: l.actorName,
                action: l.action,
                target: l.target,
              }))}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
