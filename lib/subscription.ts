import type { AccountType, Plan, Prisma, SubStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { BUSINESS_PLANS, SOLO_PLANS } from "@/lib/plans";

/**
 * Abonnementslogica per doelgroep.
 *
 * - ZZP (ook webshops): gratis plan zonder einddatum, upgrade naar Groei/Pro.
 *   Nieuwe zzp-accounts krijgen bij registratie TRIAL_DAYS dagen Groei als
 *   proef (zie "Groei-proef" hieronder). Daarna gewoon weer Gratis, nooit een poort.
 * - BEDRIJF: géén gratis plan — start in een proefperiode van TRIAL_DAYS
 *   dagen op Business (alle functies), daarna moet er een plan gekozen
 *   worden (Business of Business+). Verlopen proef = toegangspoort.
 */
export const TRIAL_DAYS = 30;

const DAY_MS = 86_400_000;

export interface SubSnapshot {
  plan: Plan;
  status: SubStatus;
  trialEndsAt: Date | null;
}

export type AccessState = "ok" | "trial" | "expired";

/*
 * Groei-proef voor zzp- en webshop-accounts
 * -----------------------------------------
 * Opslag: plan FREE, status TRIALING, trialEndsAt = registratie + TRIAL_DAYS.
 * Het opgeslagen plan blijft dus Gratis; de rechten van Groei worden bij het
 * LEZEN bepaald (effectivePlan). Na trialEndsAt is het vanzelf weer Gratis,
 * zonder cron en zonder schrijfactie. Betaalt iemand, dan zet de Mollie-webhook
 * het plan op het betaalde pakket (ACTIVE) en speelt de proef geen rol meer.
 *
 * Bestaande accounts veranderen niet: zzp-accounts van vóór deze proef hebben
 * geen trialEndsAt. Een oud bedrijfsaccount dat naar zzp is gewisseld kan nog
 * een trialEndsAt van zijn Business-proef hebben; daarom telt alleen een proef
 * die op of na SOLO_TRIAL_SINCE begon (begin = trialEndsAt - TRIAL_DAYS).
 * Nieuwe wissels naar zzp wissen de einddatum (ensureAccountSubscription).
 */

/** Het pakket dat nieuwe zzp- en webshop-accounts als proef krijgen. */
export const SOLO_TRIAL_PLAN = "GROWTH" as const satisfies Plan;

/** Begin van de Groei-proef: 18 november 2026, 00:00 in Nederland. */
export const SOLO_TRIAL_SINCE = new Date("2026-11-17T23:00:00Z");

/** Abonnement voor een nieuw zzp-/webshop-account: Gratis, met TRIAL_DAYS dagen Groei als proef. */
export function soloTrialSubscription(now: Date = new Date()): SubSnapshot {
  return { plan: "FREE", status: "TRIALING", trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS) };
}

type TrialLike = Pick<SubSnapshot, "plan"> & Partial<Pick<SubSnapshot, "status" | "trialEndsAt">>;

/**
 * Heeft dit zzp-account een Groei-proef gekregen (lopend óf verlopen)?
 * Bedrijfsaccounts nooit: die hebben hun eigen Business-proef.
 */
export function hasSoloTrial(sub: TrialLike | null | undefined, accountType: AccountType | null | undefined): boolean {
  if (!sub || accountType === "BEDRIJF") return false;
  if (sub.plan !== "FREE" || sub.status !== "TRIALING" || !sub.trialEndsAt) return false;
  return sub.trialEndsAt.getTime() - TRIAL_DAYS * DAY_MS >= SOLO_TRIAL_SINCE.getTime();
}

/** Loopt de Groei-proef nu nog? */
export function soloTrialActive(
  sub: TrialLike | null | undefined,
  accountType: AccountType | null | undefined,
  now: Date = new Date(),
): boolean {
  return hasSoloTrial(sub, accountType) && sub!.trialEndsAt! > now;
}

/**
 * Het plan waarvan de rechten nu gelden (limieten, functies, support, desktop).
 * Gelijk aan het opgeslagen plan, behalve tijdens een lopende Groei-proef.
 * Bedrijfsaccounts: altijd het opgeslagen plan (hun proef regelt accessState).
 */
export function effectivePlan(
  sub: TrialLike | null | undefined,
  accountType: AccountType | null | undefined,
  now: Date = new Date(),
): Plan {
  if (!sub) return "FREE";
  return soloTrialActive(sub, accountType, now) ? SOLO_TRIAL_PLAN : sub.plan;
}

type SubscriptionReader = Pick<Prisma.TransactionClient, "subscription">;

/** Leest abonnement + accounttype en geeft het effectieve plan. Zonder abonnement: Gratis. */
export async function effectivePlanFor(accountId: string, client: SubscriptionReader = db, now: Date = new Date()): Promise<Plan> {
  const sub = await client.subscription.findUnique({
    where: { userId: accountId },
    select: { plan: true, status: true, trialEndsAt: true, user: { select: { company: { select: { accountType: true } } } } },
  });
  return effectivePlan(sub, sub?.user?.company?.accountType ?? "ZZP", now);
}

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
 * Pure keuze voor een bedrijfsaccount: welk abonnement hoort er te staan?
 * Geeft null als het huidige abonnement al klopt (dan schrijven we niets).
 *
 * - Al een bedrijfsplan (Business/Business+) -> laten staan, ook ACTIVE.
 * - Lopende proef zonder einddatum -> einddatum erbij (TRIAL_DAYS).
 * - Geen of een zzp-plan -> Business in een verse proef van TRIAL_DAYS dagen,
 *   óók als het oude zzp-abonnement ACTIVE was. Anders zou er "Business,
 *   actief" staan terwijl er alleen voor een zzp-plan betaald wordt.
 */
export function businessSubscriptionFix(sub: SubSnapshot | null, now: Date = new Date()): SubSnapshot | null {
  const hasBusinessPlan = !!sub && (BUSINESS_PLANS as Plan[]).includes(sub.plan);
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
  if (!sub || !hasBusinessPlan) return { plan: "BUSINESS", status: "TRIALING", trialEndsAt };
  if (sub.status === "TRIALING" && !sub.trialEndsAt) return { ...sub, trialEndsAt };
  return null;
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
    const fix = businessSubscriptionFix(sub);
    // Geen fix nodig betekent: er is al een kloppend bedrijfsabonnement.
    if (!fix) return sub as SubSnapshot;
    // Verse Business-proef (bijv. na een Groei-proef als zzp): herinneringen opnieuw vanaf 7 dagen.
    const freshTrial = !sub || sub.plan !== fix.plan;
    const data = freshTrial ? { ...fix, trialNoticeDays: null } : fix;
    return db.subscription.upsert({
      where: { userId: accountId },
      create: { userId: accountId, ...data },
      update: data,
      select: { plan: true, status: true, trialEndsAt: true },
    });
  }

  // ZZP: een bedrijfsplan hoort hier niet (bijv. na type-wissel door beheer) -> terug naar gratis.
  // De einddatum van de Business-proef gaat mee weg: een wissel is geen nieuwe Groei-proef.
  if (sub && !(SOLO_PLANS as Plan[]).includes(sub.plan)) {
    return db.subscription.update({
      where: { userId: accountId },
      data: { plan: "FREE", trialEndsAt: null, trialNoticeDays: null },
      select: { plan: true, status: true, trialEndsAt: true },
    });
  }
  if (!sub) {
    return db.subscription.create({ data: { userId: accountId, plan: "FREE", status: "TRIALING" }, select: { plan: true, status: true, trialEndsAt: true } });
  }
  return sub;
}
