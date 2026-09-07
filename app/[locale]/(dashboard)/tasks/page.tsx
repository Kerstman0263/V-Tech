import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { TaskManager } from "@/components/tasks/TaskManager";

export default async function TasksPage() {
  const t = await getTranslations("tasks");
  const user = await requireUser();

  const [owner, members, projects, customers] = await Promise.all([
    db.user.findUnique({ where: { id: user.accountId }, select: { id: true, name: true, email: true, company: { select: { name: true } } } }),
    db.user.findMany({ where: { ownerId: user.accountId }, select: { id: true, name: true, email: true }, orderBy: { createdAt: "asc" } }),
    db.project.findMany({ where: { userId: user.accountId, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { userId: user.accountId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const teamOptions = [
    ...(owner ? [{ id: owner.id, name: owner.company?.name ?? owner.name ?? owner.email }] : []),
    ...members.map((m) => ({ id: m.id, name: m.name ?? m.email })),
  ];
  const canSeeAll = user.id === user.accountId || user.teamRole === "MANAGER";

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <TaskManager
        teamOptions={teamOptions}
        currentUserId={user.id}
        canSeeAll={canSeeAll}
        projectOptions={projects}
        customerOptions={customers}
      />
    </div>
  );
}
