"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";

const SEEN_KEY = "saldova-seen-version";

/**
 * "Saldova is bijgewerkt"-melding. Het paneel is een web-app: bij elke deploy
 * draait iedereen automatisch meteen de nieuwste versie (web, telefoon én
 * desktop-app — die laadt de live tool). Deze melding maakt dat zichtbaar:
 * is de versie hoger dan wat dit apparaat eerder zag, dan verschijnt één
 * bescheiden melding met een link naar "Wat is er nieuw".
 *
 * Eerste bezoek op een apparaat: stilletjes de huidige versie onthouden —
 * nieuwe gebruikers krijgen geen melding over een update die ze nooit misten.
 */
export function UpdateNotice({ version }: { version: string }) {
  const t = useTranslations("updates");
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(SEEN_KEY);
      if (!seen) {
        window.localStorage.setItem(SEEN_KEY, version);
      } else if (seen !== version) {
        setShow(true);
      }
    } catch {
      // localStorage geblokkeerd (privémodus): geen melding, geen probleem
    }
  }, [version]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, version);
    } catch {
      // negeren — de melding blijft dan hooguit nog een sessie terugkomen
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    // bottom-24 op mobiel: de bottom-tabbalk (z-70, ~63px hoog) zit eronder —
    // met bottom-4 zouden de knoppen erachter verdwijnen en onaanklikbaar zijn.
    <div
      role="status"
      className="fixed bottom-24 left-4 z-[75] max-w-xs animate-rise rounded-2xl border border-[#a855f7]/25 bg-[#12112a]/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-md md:bottom-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-[#a855f7]/25">
          <Icon name="zap" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{t("title", { version })}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t("body")}</p>
          <div className="mt-2.5 flex items-center gap-3">
            <Link
              href="/desktop"
              onClick={dismiss}
              className="text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200"
            >
              {t("cta")}
            </Link>
            <button onClick={dismiss} className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-300">
              {t("dismiss")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
