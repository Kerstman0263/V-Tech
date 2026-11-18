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
  key: "free" | "growth" | "pro" | "webshop" | "business" | "business_plus";
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
  | "customBranding"
  | "webshopIntegrations";

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
  webshopIntegrations: true,
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
      webshopIntegrations: false,
    },
    limits: { invoicesPerMonth: 5, customers: 3 },
  },
  GROWTH: {
    id: "GROWTH",
    key: "growth",
    price: 15,
    maxMembers: 0,
    seatPrice: 0,
    // Groei: onbeperkt factureren, offertes, projecten, Fiscale Rust,
    // betaalherinneringen en eigen huisstijl op facturen. Voorrang bij
    // support blijft het verschil met Pro.
    features: {
      invoices: true,
      pdfExport: true,
      quotes: true,
      timeTracking: true,
      mileageTracking: true,
      projects: true,
      tasks: true,
      reminders: true,
      fiscaleRust: true,
      multiUser: false,
      prioritySupport: false,
      customBranding: true,
      webshopIntegrations: false,
    },
    limits: { invoicesPerMonth: null, customers: null },
  },
  PRO: {
    id: "PRO",
    key: "pro",
    price: 29,
    maxMembers: 0, // 100% solo — voor personeel is er de Business-lijn
    seatPrice: 0,
    // Pro = alles van Groei, plus voorrang bij support (prioritySupport):
    // open gesprekken staan bovenaan in de support-inbox (lib/support-priority.ts).
    // Herinneringen en eigen huisstijl zitten sinds november 2026 al in Groei.
    // multiUser blijft uit (solo).
    features: { ...ALL_ON, multiUser: false, webshopIntegrations: false },
    limits: { invoicesPerMonth: null, customers: null },
  },
  WEBSHOP: {
    id: "WEBSHOP",
    key: "webshop",
    price: 39,
    maxMembers: 0, // solo-webshop; met personeel → Business-lijn (heeft webshop ook)
    seatPrice: 0,
    // Webshop = alles van Pro, plus winkelkoppelingen (Shopify/WooCommerce/
    // Bol.com/CSV), btw per EU-land (OSS) en uitbetalingen afstemmen.
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
  "webshopIntegrations",
];

/** Volgorde waarin plannen getoond worden (pricing-tabel). */
export const PLAN_ORDER: Plan[] = ["FREE", "GROWTH", "PRO", "WEBSHOP", "BUSINESS", "BUSINESS_PLUS"];

/** Plannen voor zzp'ers (solo) en voor bedrijven (team). */
export const SOLO_PLANS: Plan[] = ["FREE", "GROWTH", "PRO", "WEBSHOP"];
/** De klassieke zzp-plannen voor de prijstabel op /zzp (Webshop heeft een eigen pagina). */
export const FREELANCER_PLANS: Plan[] = ["FREE", "GROWTH", "PRO"];
export const BUSINESS_PLANS: Plan[] = ["BUSINESS", "BUSINESS_PLUS"];

/** Welke plannen hoort dit accounttype te zien/kiezen? */
export function plansForType(accountType: "ZZP" | "BEDRIJF"): Plan[] {
  return accountType === "BEDRIJF" ? BUSINESS_PLANS : SOLO_PLANS;
}

/** Heeft een plan toegang tot een bepaalde feature? */
export function planHasFeature(plan: Plan, feature: FeatureKey): boolean {
  return PLANS[plan].features[feature];
}

/**
 * Periodieke facturen (automatisch factureren) horen bij de betaalde plannen
 * (vanaf Groei: onbeperkt factureren). Gratis heeft maximaal 5 facturen per
 * maand en geen automatiseringen. Geen eigen vinkje in de prijstabel.
 */
export function planHasRecurringInvoices(plan: Plan): boolean {
  return planHasFeature(plan, "invoices") && PLANS[plan].limits.invoicesPerMonth === null;
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

/** Btw op abonnementen. De prijzen hierboven en op de site zijn exclusief btw. */
export const SUBSCRIPTION_VAT_RATE = 21;

/** Maandprijs inclusief 21% btw, in centen (exact afgerond). Gratis = 0. */
export function priceInclVatCents(plan: Plan): number {
  const netCents = Math.round(PLANS[plan].price * 100);
  return netCents + Math.round((netCents * SUBSCRIPTION_VAT_RATE) / 100);
}

/** Maandprijs inclusief btw in euro's, zoals die bij Mollie wordt afgeschreven. */
export function priceInclVat(plan: Plan): number {
  return priceInclVatCents(plan) / 100;
}
