import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ReviewForm } from "@/components/reviews/ReviewForm";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400" aria-label={`${rating}/5`}>
      {"★".repeat(rating)}
      <span className="text-slate-600">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function ReviewsPage() {
  const t = await getTranslations("reviews");

  // DB-storing mag de publieke reviewpagina nooit laten crashen.
  const reviews = await db.review
    .findMany({
      where: { approved: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    })
    .catch(() => []);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />

      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t("pageTitle")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">{t("pageSubtitle")}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 lg:grid-cols-3">
            {/* Goedgekeurde reviews */}
            <div className="lg:col-span-2">
              <h2 className="text-lg font-bold text-white">{t("listTitle")}</h2>
              {reviews.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">{t("empty")}</p>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {reviews.map((r) => (
                    <figure key={r.id} className="card-glass flex flex-col p-5">
                      <Stars rating={r.rating} />
                      <blockquote className="mt-2 flex-1 text-sm leading-relaxed text-slate-300">“{r.body}”</blockquote>
                      <figcaption className="mt-3 flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xs font-bold text-white">
                          {r.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="text-sm">
                          <span className="block font-semibold text-white">{r.name}</span>
                          {r.role && <span className="block text-slate-500">{r.role}</span>}
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>

            {/* Formulier */}
            <div>
              <h2 className="text-lg font-bold text-white">{t("formTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">{t("formSubtitle")}</p>
              <div className="mt-5">
                <ReviewForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
