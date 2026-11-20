import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import {
  AUDIENCE_FIT,
  AUDIENCE_FIT_COMPANIES,
  AUDIENCE_NOT_YET,
  BUSINESS_TEAM_MEMBERS,
  FREE_INVOICES_PER_MONTH,
  MAX_TEAM_MEMBERS,
} from "@/lib/site-focus";

/**
 * "Voor wie is Saldova?" — kort en eerlijk: voor wie het wel is en voor wie
 * (nog) niet. Staat op de homepage en op /bedrijven. De lijsten komen uit
 * lib/site-focus.ts, de teksten uit messages/*.json onder "audience".
 *
 * variant "companies" (op /bedrijven) zet kleine teams met personeel bij
 * "wel voor" en gebruikt een eigen intro; de "(nog) niet"-kaart is gelijk.
 */
export function AudienceFit({
  className,
  id = "voor-wie",
  variant = "home",
}: {
  className?: string;
  id?: string;
  variant?: "home" | "companies";
}) {
  const t = useTranslations("audience");
  const values = { invoices: FREE_INVOICES_PER_MONTH, business: BUSINESS_TEAM_MEMBERS, max: MAX_TEAM_MEMBERS };
  const fit = variant === "companies" ? AUDIENCE_FIT_COMPANIES : AUDIENCE_FIT;

  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("px-4 py-16 sm:px-6 sm:py-24", className)}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-saldova-licht">{t("eyebrow")}</p>
          <h2 id={`${id}-title`} className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">{t(variant === "companies" ? "introCompanies" : "intro")}</p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-rand bg-kaart p-6 sm:p-7">
            <h3 className="flex items-center gap-2.5 font-display text-xl font-bold text-white">
              <Icon name="check-circle" className="h-5 w-5 text-saldova-licht" />
              {t("fitTitle")}
            </h3>
            <ul className="mt-6 space-y-5">
              {fit.map((item) => (
                <li key={item.key} className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-white">{t(`fit.${item.key}.title`)}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-400">{t(`fit.${item.key}.desc`, values)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-rand bg-grond p-6 sm:p-7">
            <h3 className="flex items-center gap-2.5 font-display text-xl font-bold text-white">
              <Icon name="x-circle" className="h-5 w-5 text-slate-400" />
              {t("notYetTitle")}
            </h3>
            <ul className="mt-6 space-y-5">
              {AUDIENCE_NOT_YET.map((item) => (
                <li key={item.key} className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rand bg-kaart text-slate-400">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-200">{t(`notYet.${item.key}.title`)}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-400">{t(`notYet.${item.key}.desc`, values)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-slate-400">
          {t("doubt")}{" "}
          <Link href="/contact" className="rounded font-semibold text-saldova-licht underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">
            {t("doubtLink")}
          </Link>
        </p>
      </div>
    </section>
  );
}
