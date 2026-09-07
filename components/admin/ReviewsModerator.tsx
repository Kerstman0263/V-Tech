"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface AdminReview {
  id: string;
  name: string;
  role: string | null;
  rating: number;
  body: string;
  email: string | null;
  approved: boolean;
  createdAt: string;
}

export function ReviewsModerator({ reviews }: { reviews: AdminReview[] }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setApproved(id: string, approved: boolean) {
    setBusy(id);
    await fetch(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    setBusy(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm(t("reviewDeleteConfirm"))) return;
    setBusy(id);
    await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  if (reviews.length === 0) {
    return <p className="text-sm text-slate-400">{t("noReviews")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {reviews.map((r) => (
        <Card key={r.id} className={cn("p-5", !r.approved && "ring-1 ring-amber-300")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-400" aria-label={`${r.rating}/5`}>
                {"★".repeat(r.rating)}
                <span className="text-slate-600">{"★".repeat(5 - r.rating)}</span>
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  r.approved ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300",
                )}
              >
                {r.approved ? t("reviewApprovedTag") : t("reviewPendingTag")}
              </span>
            </div>
            <span className="text-xs text-slate-500">{r.createdAt.slice(0, 16).replace("T", " ")}</span>
          </div>

          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">“{r.body}”</p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold text-white">{r.name}</span>
              {r.role && <span className="text-slate-400"> · {r.role}</span>}
              {r.email && (
                <a href={`mailto:${r.email}`} className="ml-2 text-xs text-brand-400 hover:underline">
                  {r.email}
                </a>
              )}
            </p>
            <div className="flex items-center gap-2">
              {r.approved ? (
                <button
                  onClick={() => setApproved(r.id, false)}
                  disabled={busy === r.id}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.03] disabled:opacity-50"
                >
                  {t("reviewUnapprove")}
                </button>
              ) : (
                <button
                  onClick={() => setApproved(r.id, true)}
                  disabled={busy === r.id}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {t("reviewApprove")}
                </button>
              )}
              <button
                onClick={() => remove(r.id)}
                disabled={busy === r.id}
                className="text-xs font-medium text-rose-400 hover:underline disabled:opacity-50"
              >
                {t("reviewDelete")}
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
