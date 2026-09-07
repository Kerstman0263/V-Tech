import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { LogTable } from "@/components/logs/LogTable";

// Platformlogboek — alle systeemgebeurtenissen, alleen voor OWNER/ADMIN.
// (De admin-layout stuurt niet-beheerders al weg; dit is de tweede grendel.)
export default async function AdminLogsPage() {
  const t = await getTranslations("logs");
  await requireAdmin();

  const logs = await db.auditLog.findMany({
    where: { platform: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <div>
      <PageHeader title={t("platformTitle")} subtitle={t("platformSubtitle")} />
      <Card className="overflow-hidden">
        <LogTable
          logs={logs.map((l) => ({
            id: l.id,
            createdAt: l.createdAt.toISOString(),
            actorName: l.actorName,
            action: l.action,
            target: l.target,
          }))}
        />
      </Card>
    </div>
  );
}
