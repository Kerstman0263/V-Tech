import type { Plan } from "@prisma/client";

/**
 * Centrale definitie van de abonnementen. Prijzen in EUR per maand.
 * De i18n-labels (naam/omschrijving) staan in messages/*.json onder "pricing".
 */
export interface PlanConfig {
  id: Plan;
  /** Maandprijs in EUR (0 = gratis). */
  price: number;
  /** Vertaalsleutel in messages -> pricing.plans.<key> */
  key: "free" | "growth" | "pro" | "business" | "business_plus";
  /** Welke feature-vlaggen zijn aan (voor de pricing-matrix vinkjes). */
  features: Record<FeatureKey, boolean>;
  /** Max. aantal EXTRA medewerkers naast de eigenaar (0 = solo). */
  maxMembers: number;
  /** Prijs per extra medewerker per maand (0 = inbegrepen). */
  seatPrice: number;
  /** Limieten (null = onbeperkt). */
  limits: {
    invoicesPerMonth: number | null;
    customers: number | null;
  };
}

export type FeatureKey =
  | "invoices"
  | "pdfExport"
  | "quotes"
  | "timeTracking"
  | "mileageTracking"
  | "projects"
  | "tasks"
  | "reminders"
  | "fiscaleRust"
  | "multiUser"
  | "prioritySupport"
  | "customBranding";

const ALL_ON: Record<FeatureKey, boolean> = {
  invoices: true,
  pdfExport: true,
  quotes: true,
  timeTracking: true,
  mileageTracking: true,
  projects: true,
  tasks: true,
  reminders: true,
  fiscaleRust: true,
  multiUser: true,
  prioritySupport: true,
  customBranding: true,
};

export const PLANS: Record<Plan, PlanConfig> = {
  FREE: {
    id: "FREE",
    key: "free",
    price: 0,
    maxMembers: 0,
    seatPrice: 0,
    // Gratis geeft starters direct basis uren- en rittenregistratie;
    // Fiscale Rust zit vanaf Groei (upgrade-argument).
    features: {
      invoices: true,
      pdfExport: true,
      quotes: false,
      timeTracking: true,
      mileageTracking: true,
      projects: false,
      tasks: false,
      reminders: false,
      fiscaleRust: false,
      multiUser: false,
      prioritySupport: false,
      customBranding: false,
    },
    limits: { invoicesPerMonth: 5, customers: 3 },
  },
  GROWTH: {
    id: "GROWTH",
    key: "growth",
    price: 15,
    maxMembers: 0,
    seatPrice: 0,
    // Groei: onbeperkt factureren, offertes, projecten én Fiscale Rust.
    // Automatische herinneringen zijn een Pro-upgrade.
    features: {
      invoices: true,
      pdfExport: true,
      quotes: true,
      timeTracking: true,
      mileageTracking: true,
      projects: true,
      tasks: true,
      reminders: false,
      fiscaleRust: true,
      multiUser: false,
      prioritySupport: false,
      customBranding: false,
    },
    limits: { invoicesPerMonth: null, customers: null },
  },
  PRO: {
    id: "PRO",
    key: "pro",
    price: 29,
    maxMembers: 0, // 100% solo — voor personeel is er de Business-lijn
    seatPrice: 0,
    // Pro = de complete solo-toolkit, inclusief automatische herinneringen,
    // prioriteit-support en eigen huisstijl. multiUser blijft uit (solo).
    features: { ...ALL_ON, multiUser: false },
    limits: { invoicesPerMonth: null, customers: null },
  },
  BUSINESS: {
    id: "BUSINESS",
    key: "business",
    price: 79,
    maxMembers: 10, // tot 10 medewerkers inbegrepen
    seatPrice: 0,
    features: ALL_ON, // incl. belastingreservering (rechtsvorm-bewust: ib of vpb)
    limits: { invoicesPerMonth: null, customers: null },
  },
  BUSINESS_PLUS: {
    id: "BUSINESS_PLUS",
    key: "business_plus",
    price: 149,
    maxMembers: 25, // tot 25 medewerkers inbegrepen
    seatPrice: 0,
    features: ALL_ON,
    limits: { invoicesPerMonth: null, customers: null },
  },
};

export const ALL_FEATURES: FeatureKey[] = [
  "invoices",
  "pdfExport",
  "quotes",
  "timeTracking",
  "mileageTracking",
  "projects",
  "tasks",
  "reminders",
  "fiscaleRust",
  "multiUser",
  "prioritySupport",
  "customBranding",
];

/** Volgorde waarin plannen getoond worden (pricing-tabel). */
export const PLAN_ORDER: Plan[] = ["FREE", "GROWTH", "PRO", "BUSINESS", "BUSINESS_PLUS"];

/** Plannen voor zzp'ers (solo) en voor bedrijven (team). */
export const SOLO_PLANS: Plan[] = ["FREE", "GROWTH", "PRO"];
export const BUSINESS_PLANS: Plan[] = ["BUSINESS", "BUSINESS_PLUS"];

/** Welke plannen hoort dit accounttype te zien/kiezen? */
export function plansForType(accountType: "ZZP" | "BEDRIJF"): Plan[] {
  return accountType === "BEDRIJF" ? BUSINESS_PLANS : SOLO_PLANS;
}

/** Heeft een plan toegang tot een bepaalde feature? */
export function planHasFeature(plan: Plan, feature: FeatureKey): boolean {
  return PLANS[plan].features[feature];
}

/** Is dit een betaald plan (alles behalve gratis)? */
export function isPaidPlan(plan: Plan): boolean {
  return plan !== "FREE";
}

/** Ondersteunt dit plan teamleden? */
export function supportsTeam(plan: Plan): boolean {
  return PLANS[plan].maxMembers > 0;
}

/** Maandelijkse meerkosten voor het huidige aantal extra medewerkers. */
export function seatCost(plan: Plan, members: number): number {
  return Math.round(members * PLANS[plan].seatPrice * 100) / 100;
}
