/**
 * Uitzetbare modules: onderdelen die niet essentieel zijn en die de
 * gebruiker per account-lid via Instellingen kan verbergen. Uit = weg uit
 * het menu en de zoekbalk (Ctrl+K); aan = gewoon zichtbaar en werkend.
 *
 * Kernpagina's (dashboard, facturen, klanten, team, verlof, instellingen,
 * desktop) zijn bewust NIET uitzetbaar — daarvoor is de tool er.
 * De pagina's zelf blijven altijd bereikbaar via een directe link: dit is
 * een menu-voorkeur, geen rechtensysteem (rechten regelt lib/permissions).
 */
export const TOGGLEABLE_MODULES = [
  "time",
  "mileage",
  "tasks",
  "fiscaleRust",
  "quotes",
  "snelleOfferte",
  "expenses",
  "bank",
  "vat",
  "projects",
  "products",
  "recurring",
  "assets",
  "reports",
  "activity",
] as const;

export type ToggleableModule = (typeof TOGGLEABLE_MODULES)[number];

export function isToggleableModule(value: string): value is ToggleableModule {
  return (TOGGLEABLE_MODULES as readonly string[]).includes(value);
}
