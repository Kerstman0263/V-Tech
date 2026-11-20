import type { IconName } from "@/components/ui/Icon";
import { PLANS } from "@/lib/plans";

/**
 * Focus van de marketingsite (besluit na de klanttest van november 2026):
 * Saldova richt zich op zzp'ers en starters zonder vaste boekhouder en op
 * kleine webshops. Business en Business+ blijven bestaan, maar staan niet meer
 * als gelijkwaardige hoofdkeuze naast zzp en webshop.
 *
 * Alles wat de site over "voor wie" zegt, komt hier vandaan, zodat homepage,
 * navigatie, footer en /bedrijven hetzelfde vertellen. De teksten staan in
 * messages/*.json onder "audience" en "landing.nav".
 */

export type SolutionKey = "zzp" | "shop" | "team";
export type SolutionHref = "/zzp" | "/webshops" | "/bedrijven";

export interface Solution {
  key: SolutionKey;
  href: SolutionHref;
  icon: IconName;
}

/** De twee hoofdroutes: in de hero-sectie, het submenu en bovenaan de footer. */
export const MAIN_SOLUTIONS = [
  { key: "zzp", href: "/zzp", icon: "user" },
  { key: "shop", href: "/webshops", icon: "store" },
] as const satisfies readonly Solution[];

/** Bedrijven met personeel: bereikbaar, maar als bijroute onder de hoofdkeuzes. */
export const SECONDARY_SOLUTION = { key: "team", href: "/bedrijven", icon: "users" } as const satisfies Solution;

/** Voor wie Saldova wel bedoeld is. */
export const AUDIENCE_FIT = [
  { key: "zzp", icon: "user" },
  { key: "starter", icon: "sparkles" },
  { key: "freelance", icon: "briefcase" },
  { key: "webshop", icon: "store" },
] as const satisfies readonly { key: string; icon: IconName }[];

/**
 * Extra "wel voor"-punt op /bedrijven: die pagina verkoopt Business en
 * Business+, dus kleine teams met personeel horen daar bij "wel voor".
 * Verlof, uren per medewerker, taken en rollen bestaan (LeaveRequest,
 * TimeEntry, Task, rollen in app/api/team); loonadministratie niet.
 */
export const AUDIENCE_FIT_TEAM = { key: "team", icon: "users" } as const satisfies { key: string; icon: IconName };

/** "Wel voor" op /bedrijven: eerst kleine teams, daarna de vaste groepen. */
export const AUDIENCE_FIT_COMPANIES = [AUDIENCE_FIT_TEAM, ...AUDIENCE_FIT] as const;

/**
 * Voor wie Saldova (nog) niet bedoeld is. Elk punt klopt met de code:
 * - bv: geen eigen grootboek en geen jaarrekening (zie lib/auditfile.ts);
 * - pos: geen kassakoppeling (lib/webshop/providers.ts kent alleen webshops);
 * - care: geen declaraties bij zorgverzekeraars of gemeenten;
 * - payroll: geen loonadministratie; Business gaat tot BUSINESS_TEAM_MEMBERS,
 *   Business+ tot MAX_TEAM_MEMBERS.
 */
export const AUDIENCE_NOT_YET = [
  { key: "bv", icon: "building" },
  { key: "pos", icon: "cart" },
  { key: "care", icon: "heart" },
  { key: "payroll", icon: "users" },
] as const satisfies readonly { key: string; icon: IconName }[];

/** Teamgrootte in Business (kleinste bedrijfspakket). */
export const BUSINESS_TEAM_MEMBERS = PLANS.BUSINESS.maxMembers;

/** Grootste team dat in een pakket past (Business+). */
export const MAX_TEAM_MEMBERS = Math.max(...Object.values(PLANS).map((plan) => plan.maxMembers));

/** Aantal facturen per maand in het gratis plan, voor de tekst over starters. */
export const FREE_INVOICES_PER_MONTH = PLANS.FREE.limits.invoicesPerMonth ?? 0;
