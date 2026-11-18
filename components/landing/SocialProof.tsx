import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { Link } from "@/i18n/routing";
import { buttonClass } from "@/components/ui/Button";
import { isLaunched } from "@/lib/company";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400" aria-label={`${rating}/5`}>
      {"★".repeat(rating)}
      <span className="text-slate-600">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

// Social proof. Toont ALLEEN echte, goedgekeurde reviews uit de database.
// Zijn er nog geen, dan een eerlijke uitnodiging om de eerste te schrijven
// (nooit voorbeeld- of nepreviews: dat is misleidend en mag niet van de ACM).
export async function SocialProof() {
  const t = await getTranslations("landing");

  // DB-storing mag de landingspagina nooit laten crashen — toon dan de uitnodiging.
  const reviews = await db.review
    .findMany({
      where: { approved: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    })
    .catch(() => []);

  const items = reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, name: r.name, role: r.role ?? "" }));

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("social.title")}</h2>
          <p className="mt-3 text-slate-400">{t("social.subtitle")}</p>
        </div>

        {items.length === 0 && (
          <p className="mx-auto mt-10 max-w-xl rounded-2xl border border-dashed border-rand px-6 py-8 text-center text-slate-400">{t(isLaunched() ? "social.emptyLaunched" : "social.empty")}</p>
        )}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((r) => (
            <figure key={r.id} className="card-glass flex flex-col p-6">
              <Stars rating={r.rating} />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-slate-300">“{r.body}”</blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {r.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm">
                  <span className="block font-semibold text-white">{r.name}</span>
                  {r.role && <span className="block text-slate-400">{r.role}</span>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/reviews"
            className={buttonClass("secondary")}
          >
            {t("social.writeCta")} →
          </Link>
        </div>
      </div>
    </section>
  );
}
