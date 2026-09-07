import { db } from "@/lib/db";
import { HttpError } from "@/lib/http-error";

/**
 * Tenant-check voor gekoppelde referenties. Een taak, urenregistratie of rit
 * mag alleen verwijzen naar een klant/project van het EIGEN account —
 * anders lekt via de joins (customer.name / project.name) informatie van
 * een ander account naar buiten.
 */
export async function assertOwnedRefs(
  accountId: string,
  refs: { customerId?: string | null; projectId?: string | null },
): Promise<void> {
  if (refs.customerId) {
    const c = await db.customer.findFirst({ where: { id: refs.customerId, userId: accountId }, select: { id: true } });
    if (!c) throw new HttpError(404, "Klant niet gevonden.");
  }
  if (refs.projectId) {
    const p = await db.project.findFirst({ where: { id: refs.projectId, userId: accountId }, select: { id: true } });
    if (!p) throw new HttpError(404, "Project niet gevonden.");
  }
}
