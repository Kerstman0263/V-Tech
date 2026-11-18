// Relatief pad: prisma/seed.ts importeert dit bestand ook buiten Next om.
import { HttpError } from "./http-error";

// Gedeelde demo-account credentials. Gebruikt door zowel het seed-script
// (om het account aan te maken) als de demo-knop op de loginpagina.
// Het demo-account is een volwaardig account (plan PRO) — net zo krachtig
// als elk ander account, maar bedoeld om vrijblijvend uit te proberen.
export const DEMO_EMAIL = "demo@v-techsystems.nl";
export const DEMO_PASSWORD = "demo-vtech-2026";

/**
 * Het demo-account wordt door iedereen tegelijk gebruikt. Wat de toegang van
 * de volgende bezoeker raakt (e-mail, wachtwoord, tweestapsverificatie,
 * teamleden, winkelkoppelingen, account verwijderen, overstappen) zetten we
 * daarom op slot. Gewoon werken (facturen, uren, ritten) blijft gewoon kunnen.
 */
export function isDemoUser(user: { email?: string | null } | null | undefined): boolean {
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  return email !== "" && email === DEMO_EMAIL.toLowerCase();
}

/** Fout met een vaste code, zodat de interface er een nette melding bij kan tonen. */
export class DemoLockedError extends HttpError {
  readonly code = "demo_locked";
  constructor() {
    super(403, "In de demo kun je dit niet wijzigen");
  }
}

/** Gooit 403 (code 'demo_locked') voor het demo-account; doet niets voor anderen. */
export function assertNotDemo(user: { email?: string | null } | null | undefined): void {
  if (isDemoUser(user)) throw new DemoLockedError();
}
