import type { Plan, Role } from "@prisma/client";
import { isPaidPlan } from "@/lib/plans";

/**
 * Saldova Desktop (Windows) — gedeelde regels tussen webapp en desktop-shell.
 *
 * De desktop-app is een betaald voordeel: gratis accounts gebruiken Saldova
 * via de browser of telefoon (PWA), betaalde plannen mogen ook de
 * downloadbare Windows-app gebruiken. De shell identificeert zich via een
 * User-Agent-token; de dashboard-layout dwingt de regel server-side af.
 */

/** Token dat de desktop-shell aan zijn User-Agent toevoegt. */
export const DESKTOP_UA_TOKEN = "SaldovaDesktop";

/** Huidige versie van de Windows-app (gelijk houden aan saldova-desktop/package.json). */
export const DESKTOP_VERSION = "1.0.0";

/**
 * Download-URL van de Windows-installer. `null` zolang er nog geen publieke
 * hosting is (pre-launch); de downloadpagina toont dan "beschikbaar bij launch".
 * Bij launch: zet hier de definitieve URL (bijv. GitHub Releases of eigen CDN).
 */
export const DESKTOP_DOWNLOAD_URL: string | null = null;

/** Komt dit verzoek uit de Saldova desktop-app? */
export function isDesktopUserAgent(ua: string | null | undefined): boolean {
  return typeof ua === "string" && ua.includes(DESKTOP_UA_TOKEN);
}

/** Versie van de desktop-app die dit verzoek doet, of null in de browser. */
export function desktopVersionFromUA(ua: string | null | undefined): string | null {
  const m = /SaldovaDesktop\/(\d+\.\d+\.\d+)/.exec(ua ?? "");
  return m?.[1] ?? null;
}

/**
 * Mag dit account de desktop-app gebruiken? Betaalde plannen (het effectieve
 * plan van de account-eigenaar, dus medewerkers van een betalend bedrijf ook)
 * plus platformbeheerders — zodat het team zelf altijd kan testen.
 */
export function canUseDesktopApp(plan: Plan, role: Role): boolean {
  return isPaidPlan(plan) || role === "ADMIN" || role === "OWNER";
}
