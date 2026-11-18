"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LAUNCH_OFFER } from "@/lib/marketing";

// Dismissbare actiebalk bovenaan de site. Onthoudt sluiten via localStorage.
// Milde urgentie, géén nep-aftelklok — de tekst is waarheidsgetrouw te houden.
export function LaunchBanner() {
  const t = useTranslations("landing");
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!LAUNCH_OFFER.enabled) return;
    setHidden(localStorage.getItem("saldova-launch-dismissed") === "1");
  }, []);

  if (!LAUNCH_OFFER.enabled || hidden) return null;

  return (
    <div className="relative bg-saldova px-4 py-2.5 text-center text-sm text-white">
      <span className="font-medium">{t("launch.text")}</span>{" "}
      <Link href="/register" className="font-semibold underline underline-offset-2 hover:text-brand-100">
        {t("launch.cta")} →
      </Link>
      <button
        type="button"
        aria-label={t("launch.dismiss")}
        onClick={() => {
          localStorage.setItem("saldova-launch-dismissed", "1");
          setHidden(true);
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
