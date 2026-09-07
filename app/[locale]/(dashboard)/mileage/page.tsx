import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { planHasFeature } from "@/lib/plans";
import { PageHeader } from "@/components/ui/PageHeader";
import { MileageManager } from "@/components/mileage/MileageManager";

export default async function MileagePage() {
  const t = await getTranslations("mileage");
  const user = await requireUser();

  const sub = await db.subscription.findUnique({ where: { userId: user.accountId } });
  const allowed = planHasFeature(sub?.plan ?? "FREE", "mileageTracking");

  if (!allowed) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold text-white">{t("title")}</h1>
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-300">
          {t("upgradeRequired")}
        </p>
      </div>
    );
  }

  const projects = await db.project.findMany({
    where: { userId: user.accountId, archived: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <MileageManager projects={projects} />
    </div>
  );
}
