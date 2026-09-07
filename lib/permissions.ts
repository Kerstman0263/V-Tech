import { HttpError } from "@/lib/http-error";

/**
 * Rechten BINNEN een account (abonnement).
 *
 * - Account-eigenaar (user.id === user.accountId) en platformbeheerders (OWNER/ADMIN): alles.
 * - Teamleden: een rechtenmatrix van vier vinkjes (zie MATRIX_CAPS). Standaard
 *   per rol (permissionsCustom = false), of per persoon ingesteld door de eigenaar
 *   (permissionsCustom = true, permissions = de aangevinkte rechten).
 *
 *   Rol            Facturatie  Uren goedkeuren  Team beheren  Bank & btw exporteren
 *   Medewerker     -           -                -             -
 *   Leidinggevende -           ✓                ✓             -
 *   Boekhouder     ✓           -                -             ✓
 *
 * BELANGRIJK (AVG): dit MOET server-side afgedwongen worden (API + pagina's),
 * niet alleen door menu-items te verbergen. Menu verbergen is UX; deze checks
 * zijn de echte beveiliging.
 */

/** De vier vinkjes van de rechtenmatrix. */
export const MATRIX_CAPS = ["financials", "approveHours", "manageTeam", "exports"] as const;
export type MatrixCap = (typeof MATRIX_CAPS)[number];

export type Capability =
  | MatrixCap // financials = facturen, offertes, uitgaven, btw, klanten, projecten, omzet
  //             approveHours = uren van medewerkers goedkeuren/afkeuren
  //             manageTeam = teamleden bekijken/toevoegen, medewerker-detail, taken toewijzen
  //             exports = bank-import bevestigen, btw-/boekhouder-/auditfile-exports
  | "viewActivity" // account-activiteitenlog (volgt manageTeam)
  | "companySettings"; // bedrijfsprofiel, abonnement, huisstijl (alleen eigenaar)

export interface PermissionUser {
  id: string;
  accountId: string;
  role?: string | null;
  teamRole?: string | null;
  permissions?: string[] | null;
  permissionsCustom?: boolean | null;
}

export function isPlatformAdmin(user: PermissionUser): boolean {
  return user.role === "ADMIN" || user.role === "OWNER";
}

/** Is dit de eigenaar van het abonnement/account (niet een teamlid)? */
export function isAccountOwner(user: PermissionUser): boolean {
  return user.id === user.accountId;
}

/** Standaardrechten per teamrol (de "rol-preset" in de matrix). */
export function defaultPermissions(teamRole: string | null | undefined): MatrixCap[] {
  switch (teamRole) {
    case "MANAGER":
      return ["approveHours", "manageTeam"];
    case "ACCOUNTANT":
      return ["financials", "exports"];
    default:
      return [];
  }
}

/** Effectieve matrix-rechten van een gebruiker (eigenaar/beheerder = alles). */
export function effectivePermissions(user: PermissionUser): MatrixCap[] {
  if (isPlatformAdmin(user) || isAccountOwner(user)) return [...MATRIX_CAPS];
  if (user.permissionsCustom) {
    return (user.permissions ?? []).filter((p): p is MatrixCap => (MATRIX_CAPS as readonly string[]).includes(p));
  }
  return defaultPermissions(user.teamRole);
}

export function can(user: PermissionUser, cap: Capability): boolean {
  if (isPlatformAdmin(user)) return true;
  const owner = isAccountOwner(user);
  if (owner) return true;
  const eff = effectivePermissions(user);
  switch (cap) {
    case "companySettings":
      return false;
    case "viewActivity":
      return eff.includes("manageTeam");
    default:
      return eff.includes(cap);
  }
}

/** Gooit 403 als de gebruiker de capability niet heeft (voor API-routes). */
export function assertCan(user: PermissionUser, cap: Capability): void {
  if (!can(user, cap)) {
    throw new HttpError(403, "Je hebt geen toegang tot dit onderdeel.");
  }
}
