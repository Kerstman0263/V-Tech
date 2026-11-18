import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { setupProgress } from "@/lib/setup-progress";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/Card";

export async function GettingStarted() {
  const user = await requireUser();
  if (user.id !== user.accountId) return null;
  const t = await getTranslations("setup");
  const progress = await setupProgress(user.accountId);
  const count = progress.filter(Boolean).length;
  if (count === 3) return null;
  return <Card className="border-brand-500/20 p-6">
    <p className="text-xs font-semibold text-brand-300">{t("progress", { count })}</p>
    <h2 className="mt-2 text-lg font-bold text-white">{t("title")}</h2><p className="mt-1 text-sm text-slate-400">{t("resume")}</p>
    <Link href="/start" className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">{t("continue")} →</Link>
  </Card>;
}
