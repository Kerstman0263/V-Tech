import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SaldovaLogo } from "@/components/ui/SaldovaLogo";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// 404 in de Ova-huisstijl, in de taal van de bezoeker. Verschijnt bij notFound()
// en voor elke onbekende URL (via app/[locale]/[...rest]/page.tsx).
export default function NotFound() {
  const t = useTranslations("notFound");
  const tn = useTranslations("landing.nav");

  return (
    <main className="flex min-h-screen flex-col bg-grond px-4 text-white sm:px-6">
      <div className="mx-auto w-full max-w-6xl py-6">
        <SaldovaLogo href="/" label={tn("homeAria")} />
      </div>
      <div className="flex flex-1 items-center justify-center pb-24">
        <div className="w-full max-w-lg rounded-3xl border border-rand bg-kaart p-6 text-center sm:p-10">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-saldova-licht">{t("eyebrow")}</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="mt-4 text-slate-300">{t("text")}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
              {t("home")}
            </Link>
            <Link href="/dashboard" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
              {t("dashboard")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
