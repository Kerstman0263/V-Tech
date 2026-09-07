import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { SupportInbox } from "@/components/admin/SupportInbox";
import { Link } from "@/i18n/routing";

export default async function AdminSupportPage() {
  const t = await getTranslations("support");
  const ta = await getTranslations("admin");
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("inboxTitle")}
        subtitle={t("inboxSubtitle")}
        action={
          <Link href="/admin" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ← {ta("title")}
          </Link>
        }
      />
      <SupportInbox />
    </div>
  );
}
