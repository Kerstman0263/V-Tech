/**
 * Rol-specifieke productrondleiding.
 *
 * De variant wordt SERVER-SIDE bepaald (zie de dashboard-layout), zodat een
 * medewerker nooit een tour krijgt die naar financiële modules wijst — die
 * menu-items bestaan voor hem niet eens in de DOM.
 *
 * `target` is een CSS-selector. De ankers:
 *  - #tour-welcome, #tour-team-today  -> dashboardpagina
 *  - #menu-<key>                      -> zijbalk-items (alleen desktop-zijbalk;
 *    de mobiele drawer krijgt bewust GEEN ids, anders staan ze dubbel in de DOM)
 */

export type TourVariant = "ZZP" | "BEDRIJF_OWNER" | "BEDRIJF_MEMBER";

export interface TourStep {
  /** i18n-sleutel: tour.steps.<key>.title / .body */
  key: string;
  /** Element dat wordt uitgelicht. */
  target: string;
  /** Voorkeurskant van de tooltip op desktop. */
  side: "right" | "bottom";
}

const WELCOME: TourStep = { key: "welcome", target: "#tour-welcome", side: "bottom" };

export const TOURS: Record<TourVariant, TourStep[]> = {
  // Eigenaar van een bedrijf: volledige rondleiding.
  BEDRIJF_OWNER: [
    WELCOME,
    { key: "teamToday", target: "#tour-team-today", side: "bottom" },
    { key: "projects", target: "#menu-projects", side: "right" },
    { key: "customers", target: "#menu-customers", side: "right" },
  ],

  // Medewerker/leidinggevende: korte, privacy-proof rondleiding.
  // Verwijst UITSLUITEND naar het eigen werk — geen administratie of facturen.
  BEDRIJF_MEMBER: [
    WELCOME,
    { key: "memberTime", target: "#menu-time", side: "right" },
    { key: "memberLeave", target: "#menu-leave", side: "right" },
  ],

  // Zzp'er: solo-rondleiding.
  ZZP: [
    WELCOME,
    { key: "time", target: "#menu-time", side: "right" },
    { key: "mileage", target: "#menu-mileage", side: "right" },
    { key: "fiscaleRust", target: "#menu-fiscaleRust", side: "right" },
  ],
};
