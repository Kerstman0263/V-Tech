import type { Plan } from "@prisma/client";
import { planHasFeature } from "@/lib/plans";

/**
 * Voorrang bij support (feature "prioritySupport", vanaf Pro).
 *
 * Wat het concreet betekent: in de support-inbox van de beheerder staan open
 * gesprekken van klanten met voorrang bovenaan, met een label "Voorrang".
 * Afgehandelde gesprekken krijgen geen voorrang, zodat ze de lijst niet
 * verstoppen. Binnen elke groep blijft de volgorde: nieuwste bericht eerst.
 */

export type SupportThreadStatus = "OPEN" | "PENDING" | "RESOLVED";

export interface SupportThreadForSort {
  status: SupportThreadStatus;
  lastAt: Date | null;
  priority: boolean;
}

/**
 * Het pakket dat telt voor een support-gesprek: dat van de abonnementhouder.
 * Een medewerker in een team heeft zelf geen abonnement; dan telt dat van de
 * eigenaar. Zonder abonnement geldt Gratis.
 */
export function supportPlanFor(user: {
  subscription?: { plan: Plan } | null;
  owner?: { subscription?: { plan: Plan } | null } | null;
}): Plan {
  return user.owner?.subscription?.plan ?? user.subscription?.plan ?? "FREE";
}

/** Krijgt dit pakket voorrang bij support? */
export function hasPrioritySupport(plan: Plan): boolean {
  return planHasFeature(plan, "prioritySupport");
}

/** Sorteert support-gesprekken: open gesprekken met voorrang eerst, daarna nieuwste eerst. */
export function sortSupportThreads<T extends SupportThreadForSort>(threads: T[]): T[] {
  const rank = (t: T) => (t.priority && t.status !== "RESOLVED" ? 0 : 1);
  return [...threads].sort(
    (a, b) => rank(a) - rank(b) || (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0),
  );
}
