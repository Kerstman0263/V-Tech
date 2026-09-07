import { DESKTOP_VERSION } from "@/lib/desktop";

/**
 * Changelog en roadmap van de desktop-app, getoond op /desktop.
 * Tweetalige data (geen i18n-sleutels: dit is inhoud, geen UI-tekst).
 *
 * Bij een nieuwe release: bovenaan DESKTOP_RELEASES toevoegen én
 * DESKTOP_VERSION in lib/desktop.ts + saldova-desktop verhogen —
 * de nieuwste release hier hoort altijd gelijk te zijn aan DESKTOP_VERSION.
 */
export interface ReleaseItem {
  nl: string;
  en: string;
}

export interface Release {
  version: string;
  /** ISO-datum (YYYY-MM-DD). */
  date: string;
  items: ReleaseItem[];
}

export const DESKTOP_RELEASES: Release[] = [
  {
    version: "1.0.0",
    date: "2026-08-22",
    items: [
      {
        nl: "Eerste versie: de complete Saldova-tool als eigen Windows-app",
        en: "First release: the complete Saldova tool as its own Windows app",
      },
      {
        nl: "Randloos donker venster — de app is één geheel, zonder witte randen",
        en: "Borderless dark window — the app is one seamless whole, no white edges",
      },
      {
        nl: "Zoeken en springen met Ctrl+K door de hele tool",
        en: "Search and jump anywhere in the tool with Ctrl+K",
      },
      {
        nl: "Rondleiding bij je eerste bezoek aan elke pagina",
        en: "A guided tour on your first visit to every page",
      },
      {
        nl: "Offline-scherm dat automatisch verdergaat zodra je weer verbinding hebt",
        en: "Offline screen that resumes automatically once you reconnect",
      },
    ],
  },
];

export const DESKTOP_UPCOMING: ReleaseItem[] = [
  {
    nl: "Automatische updates — de app werkt zichzelf bij, jij hoeft niets te doen",
    en: "Automatic updates — the app keeps itself current, nothing for you to do",
  },
  {
    nl: "Ondertekende installer, zodat de Windows-beveiligingsmelding verdwijnt",
    en: "Signed installer, so the Windows security warning disappears",
  },
  {
    nl: "Eigen domein: de app verhuist naar app.saldova.nl",
    en: "Own domain: the app moves to app.saldova.nl",
  },
];

/** De nieuwste release hoort gelijk te lopen met DESKTOP_VERSION. */
export const LATEST_DESKTOP_VERSION = DESKTOP_VERSION;
