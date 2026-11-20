/**
 * Toestanden van de vakjes in het statustabblad van de hulp-widget (components/landing/HelpHub.tsx).
 * Zonder afhankelijkheden, zodat de clientcomponent dit mag importeren en tests het kunnen nalopen.
 *
 *  - pending: de meting loopt nog;
 *  - ok: gemeten en in orde (groen);
 *  - down: gemeten en niet in orde (rood);
 *  - unknown: niet gemeten. Neutraal, want "we weten het niet" is iets anders dan "het is stuk".
 */
export type CheckState = "pending" | "ok" | "down" | "unknown";

type Region = { region: string | null; place: string | null; eu: boolean };

/** Welk label het serverregio-vakje krijgt (messages: help.statusServer*). */
export type ServerCheckLabel = { key: "statusServerPending" } | { key: "statusServerUnknown" } | { key: "statusServer"; place: string };

/**
 * Het serverregio-vakje, uit de meting van /api/status (VERCEL_REGION). Groen alleen als de regio
 * gemeten is en in de EU ligt; rood als hij gemeten is en erbuiten ligt; neutraal als er niets
 * gemeten is (lokaal zonder VERCEL_REGION, of /api/status gaf geen antwoord).
 */
export function serverRegionCheck(server: Region | null | undefined, measured: boolean, failed: boolean): { label: ServerCheckLabel; state: CheckState } {
  if (!measured) return failed ? { label: { key: "statusServerUnknown" }, state: "unknown" } : { label: { key: "statusServerPending" }, state: "pending" };
  if (!server?.region) return { label: { key: "statusServerUnknown" }, state: "unknown" };
  return { label: { key: "statusServer", place: server.place ?? server.region }, state: server.eu ? "ok" : "down" };
}

/** Van de oude ja/nee/bezig-waarde naar een toestand, voor de vakjes die altijd iets meten. */
export function measuredState(ok: boolean | null): CheckState {
  return ok === null ? "pending" : ok ? "ok" : "down";
}
