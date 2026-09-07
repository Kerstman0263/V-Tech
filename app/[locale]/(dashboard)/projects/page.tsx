import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectManager } from "@/components/projects/ProjectManager";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";

export default async function ProjectsPage() {
  const t = await getTranslations("projects");
  const user = await requireUser();
  if (!can(user, "financials")) redirect("/dashboard");

  const customers = await db.customer.findMany({
    where: { userId: user.accountId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ProjectManager customers={customers} />
    </div>
  );
}
