"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { OvaEi } from "@/components/ova-ei";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Foutscherm voor alles onder /[locale] (website én dashboard). De layout met
// vertalingen blijft staan; alleen dit deel wordt vervangen. "Opnieuw proberen"
// rendert het deel opnieuw zonder de hele pagina te herladen.
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    // Alleen in de browserconsole; geen gegevens naar buiten.
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex min-h-[70vh] items-center justify-center bg-grond px-4 py-16 text-white sm:px-6">
      <div className="w-full max-w-lg rounded-3xl border border-rand bg-kaart p-6 text-center sm:p-10">
        <OvaEi merk="saldova" className="mx-auto h-10 w-auto" />
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-3 text-slate-300">{t("text")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
            {t("retry")}
          </button>
          <Link href="/" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
            {t("home")}
          </Link>
        </div>
        {error.digest && <p className="mt-6 text-xs text-slate-400">{t("code", { digest: error.digest })}</p>}
      </div>
    </div>
  );
}
