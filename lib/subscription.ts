import type { AccountType, Plan, SubStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { BUSINESS_PLANS, SOLO_PLANS } from "@/lib/plans";

/**
 * Abonnementslogica per doelgroep.
 *
 * - ZZP: gratis plan zonder einddatum, upgrade naar Groei/Pro.
 * - BEDRIJF: géén gratis plan — start in een proefperiode van TRIAL_DAYS
 *   dagen op Business (alle functies), daarna moet er een plan gekozen
 *   worden (Business of Business+). Verlopen proef = toegangspoort.
 */
export const TRIAL_DAYS = 30;

export interface SubSnapshot {
  plan: Plan;
  status: SubStatus;
  trialEndsAt: Date | null;
}

export type AccessState = "ok" | "trial" | "expired";

/** Dagen proef die nog resten (kan negatief zijn als verlopen). */
export function trialDaysLeft(sub: SubSnapshot, now: Date = new Date()): number | null {
  if (!sub.trialEndsAt) return null;
  return Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000);
}

/** Toegangsstatus van een account op basis van type + abonnement. */
export function accessState(sub: SubSnapshot, accountType: AccountType, now: Date = new Date()): AccessState {
  if (accountType !== "BEDRIJF") return "ok";
  if (sub.status === "ACTIVE") return "ok";
  if (sub.status === "TRIALING" && sub.trialEndsAt) return sub.trialEndsAt > now ? "trial" : "expired";
  if (sub.status === "TRIALING") return "trial"; // oud account zonder einddatum: hersteld door ensureAccountSubscription
  return "expired"; // PAST_DUE / CANCELED
}

/**
 * Zorgt dat een account het juiste type abonnement heeft. Repareert oudere
 * bedrijfsaccounts die nog op een zzp-plan staan (FREE/GROWTH/PRO) door ze
 * in een verse proefperiode op Business te zetten. Idempotent en goedkoop:
 * alleen een write als er iets mis is.
 */
export async function ensureAccountSubscription(accountId: string, accountType: AccountType): Promise<SubSnapshot> {
  const sub = await db.subscription.findUnique({
    where: { userId: accountId },
    select: { plan: true, status: true, trialEndsAt: true },
  });

  if (accountType === "BEDRIJF") {
    const wrongPlan = !sub || !(BUSINESS_PLANS as Plan[]).includes(sub.plan);
    const missingTrialEnd = sub?.status === "TRIALING" && !sub.trialEndsAt;
    if (wrongPlan || missingTrialEnd) {
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
      const fixed = await db.subscription.upsert({
        where: { userId: accountId },
        create: { userId: accountId, plan: "BUSINESS", status: "TRIALING", trialEndsAt },
        update: {
          ...(wrongPlan ? { plan: "BUSINESS", status: sub?.status === "ACTIVE" ? "ACTIVE" : "TRIALING" } : {}),
          ...(wrongPlan || missingTrialEnd ? { trialEndsAt } : {}),
        },
        select: { plan: true, status: true, trialEndsAt: true },
      });
      return fixed;
    }
    return sub;
  }

  // ZZP: een bedrijfsplan hoort hier niet (bijv. na type-wissel door beheer) -> terug naar gratis
  if (sub && !(SOLO_PLANS as Plan[]).includes(sub.plan)) {
    return db.subscription.update({ where: { userId: accountId }, data: { plan: "FREE" }, select: { plan: true, status: true, trialEndsAt: true } });
  }
  if (!sub) {
    return db.subscription.create({ data: { userId: accountId, plan: "FREE", status: "TRIALING" }, select: { plan: true, status: true, trialEndsAt: true } });
  }
  return sub;
}
