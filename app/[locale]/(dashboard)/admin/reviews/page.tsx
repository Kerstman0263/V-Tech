import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Link } from "@/i18n/routing";
import { ReviewsModerator } from "@/components/admin/ReviewsModerator";

export default async function AdminReviewsPage() {
  const t = await getTranslations("admin");
  await requireAdmin();

  // In afwachting bovenaan, daarna nieuwste eerst
  const reviews = await db.review.findMany({
    orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
  });

  const serialized = reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("reviews")}
        subtitle={t("reviewsSub")}
        action={
          <Link href="/admin" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ← {t("title")}
          </Link>
        }
      />
      <ReviewsModerator reviews={serialized} />
    </div>
  );
}
