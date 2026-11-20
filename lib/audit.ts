import { db } from "@/lib/db";

/**
 * Twee logboeken in één tabel (AuditLog):
 *  - logAccount:  gebeurtenissen binnen één abonnement (zichtbaar voor de
 *    account-eigenaar en leidinggevenden op /activiteit).
 *  - logPlatform: systeemgebeurtenissen (zichtbaar voor OWNER/ADMIN op /admin/logs).
 * Fire-and-forget: loggen mag NOOIT de hoofdactie laten falen.
 */

interface Actor {
  id?: string | null;
  name?: string | null;
  email?: string | null;
}

function actorName(actor: Actor): string {
  return actor.name || actor.email || "systeem";
}

export function logAccount(accountId: string, actor: Actor, action: string, target?: string | null): void {
  db.auditLog
    .create({
      data: {
        platform: false,
        accountId,
        actorId: actor.id ?? null,
        actorName: actorName(actor),
        action,
        target: target ?? null,
      },
    })
    .catch((e) => console.error("[audit] account-log mislukt:", e?.message));
}

/**
 * Meerdere account-regels in één keer, en WEL afwachten: voor vastleggingen
 * waar de gebruiker op moet kunnen terugvallen (zoals wijzigingen in een
 * afgesloten kwartaal). Een fire-and-forget insert kan op een serverless
 * platform verloren gaan zodra het antwoord is verstuurd. Een fout laat de
 * hoofdactie nog steeds niet falen; we geven wel terug of het lukte.
 */
export async function logAccountMany(accountId: string, actor: Actor, action: string, targets: string[]): Promise<boolean> {
  if (!targets.length) return true;
  try {
    await db.auditLog.createMany({
      data: targets.map((target) => ({
        platform: false,
        accountId,
        actorId: actor.id ?? null,
        actorName: actorName(actor),
        action,
        target,
      })),
    });
    return true;
  } catch (e) {
    console.error("[audit] account-log mislukt:", (e as Error | undefined)?.message);
    return false;
  }
}

export function logPlatform(actor: Actor, action: string, target?: string | null): void {
  db.auditLog
    .create({
      data: {
        platform: true,
        actorId: actor.id ?? null,
        actorName: actorName(actor),
        action,
        target: target ?? null,
      },
    })
    .catch((e) => console.error("[audit] platform-log mislukt:", e?.message));
}
