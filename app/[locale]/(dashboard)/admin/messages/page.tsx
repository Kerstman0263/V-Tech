import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/routing";

export default async function AdminMessagesPage() {
  const t = await getTranslations("admin");
  await requireAdmin();

  const messages = await db.contactMessage.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("messages")}
        subtitle={t("messagesSub")}
        action={
          <Link href="/admin" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.03]">
            ← {t("title")}
          </Link>
        }
      />

      {messages.length === 0 ? (
        <EmptyState icon="inbox" title={t("noMessages")} />
      ) : (
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-white">{m.name}</span>
                  <a href={`mailto:${m.email}`} className="ml-2 text-sm text-brand-400 hover:underline">
                    {m.email}
                  </a>
                </div>
                <span className="text-xs text-slate-500">{m.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </div>
              {m.subject && <p className="mt-1 text-sm font-medium text-slate-300">{m.subject}</p>}
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{m.message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
