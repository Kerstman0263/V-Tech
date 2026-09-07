import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { Link } from "@/i18n/routing";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400" aria-label={`${rating}/5`}>
      {"★".repeat(rating)}
      <span className="text-slate-600">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

// Social proof. Toont ECHTE, goedgekeurde reviews uit de database.
// Zolang er nog geen goedgekeurde reviews zijn, valt het terug op nette
// placeholders (zodat de sectie niet leeg oogt vóór de eerste review).
export async function SocialProof() {
  const t = await getTranslations("landing");

  // DB-storing mag de landingspagina nooit laten crashen — val dan terug op placeholders.
  const reviews = await db.review
    .findMany({
      where: { approved: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    })
    .catch(() => []);

  const placeholders = ["1", "2", "3"].map((n) => ({
    id: n,
    rating: 5,
    body: t(`social.q${n}`),
    name: t(`social.name${n}`),
    role: t(`social.role${n}`),
  }));

  const items =
    reviews.length > 0
      ? reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, name: r.name, role: r.role ?? "" }))
      : placeholders;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("social.title")}</h2>
          <p className="mt-3 text-slate-400">{t("social.subtitle")}</p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((r) => (
            <figure key={r.id} className="card-glass flex flex-col p-6 transition-all duration-200 hover:bg-white/[0.04]">
              <Stars rating={r.rating} />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-slate-300">“{r.body}”</blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
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

        <div className="mt-10 text-center">
          <Link
            href="/reviews"
            className="inline-block rounded-xl border border-white/10 px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/5"
          >
            {t("social.writeCta")} →
          </Link>
        </div>
      </div>
    </section>
  );
}
