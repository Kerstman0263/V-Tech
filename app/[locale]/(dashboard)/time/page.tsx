import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { planHasFeature } from "@/lib/plans";
import { effectivePlanFor } from "@/lib/subscription";
import { PageHeader } from "@/components/ui/PageHeader";
import { TimeManager } from "@/components/time/TimeManager";
import { can } from "@/lib/permissions";

export default async function TimePage() {
  const t = await getTranslations("time");
  const user = await requireUser();

  const allowed = planHasFeature(await effectivePlanFor(user.accountId), "timeTracking");

  if (!allowed) {
    return (
      <div>
        <PageHeader title={t("title")} />
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-300">
          {t("upgradeRequired")}
        </p>
      </div>
    );
  }

  // Goedkeuringsflow (alleen bedrijven): eigenaar/leidinggevende beoordeelt, medewerker wacht.
  const company = await db.company.findUnique({ where: { userId: user.accountId }, select: { accountType: true } });
  const isBedrijf = company?.accountType === "BEDRIJF";
  const isManager = can(user, "manageTeam") || can(user, "approveHours");
  const canApprove = can(user, "approveHours");

  const [projects, customers] = await Promise.all([
    db.project.findMany({ where: { userId: user.accountId, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { userId: user.accountId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <TimeManager projects={projects} customers={customers} canApprove={isBedrijf && canApprove} needsApproval={isBedrijf && !isManager} />
    </div>
  );
}
