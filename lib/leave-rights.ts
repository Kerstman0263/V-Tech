import { can, type PermissionUser } from "@/lib/permissions";

/**
 * Wie mag over verlof beslissen (goedkeuren, afwijzen, budgetten instellen)?
 * Dezelfde rechtenmatrix als de rest van Saldova: de eigenaar, en iedereen
 * die uren mag goedkeuren of het team beheert. Zo werkt een persoonlijk
 * ingestelde matrix ook hier, en niet alleen de rol "leidinggevende".
 *
 * Let op: over je EIGEN aanvraag beslist altijd iemand anders (behalve de
 * eigenaar, die eigen verlof direct registreert). Dat regelen de routes.
 */
export function canDecideLeave(user: PermissionUser): boolean {
  return can(user, "approveHours") || can(user, "manageTeam");
}
