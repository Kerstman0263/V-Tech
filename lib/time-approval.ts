import type { TimeApproval } from "@prisma/client";

/**
 * Uren-goedkeuring (alleen bedrijfsaccounts).
 *
 * - Uren van een medewerker (geen eigenaar/leidinggevende) starten als PENDING
 *   en moeten beoordeeld worden voordat ze gefactureerd kunnen worden.
 * - Uren van de eigenaar/leidinggevende zelf en álle zzp-uren: NOT_REQUIRED.
 * - Past een medewerker een beoordeelde registratie aan, dan gaat die opnieuw
 *   ter beoordeling (anders kon je na goedkeuring stiekem uren ophogen).
 */

export function initialApproval(opts: { isBedrijf: boolean; isManager: boolean }): TimeApproval {
  return opts.isBedrijf && !opts.isManager ? "PENDING" : "NOT_REQUIRED";
}

/** Mag deze registratie gefactureerd / op "gefactureerd" gezet worden? */
export function canBill(approval: TimeApproval): boolean {
  return approval === "NOT_REQUIRED" || approval === "APPROVED";
}

/**
 * Nieuwe goedkeuringsstatus na een inhoudelijke wijziging.
 * Managers wijzigen zonder gevolgen; medewerkers zetten de status terug naar PENDING.
 */
export function approvalAfterEdit(current: TimeApproval, editorIsManager: boolean): TimeApproval {
  if (editorIsManager || current === "NOT_REQUIRED") return current;
  return "PENDING";
}

/** Zijn er velden gewijzigd die een herbeoordeling rechtvaardigen? */
export function isSubstantiveEdit(data: { hours?: unknown; date?: unknown; description?: unknown; projectId?: unknown; customerId?: unknown }): boolean {
  return data.hours !== undefined || data.date !== undefined || data.description !== undefined || data.projectId !== undefined || data.customerId !== undefined;
}
