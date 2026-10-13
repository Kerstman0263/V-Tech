/**
 * "Vandaag doen": maximaal vier concrete acties bovenaan het dashboard, in
 * gewone taal en met één knop per actie. Pure functie, zodat de volgorde en
 * drempels los te testen zijn; de dashboardpagina levert de cijfers aan.
 */

export type TodayActionKey =
  | "lateInvoices"
  | "draftInvoices"
  | "unbilledHours"
  | "expiringQuotes"
  | "vatReturn"
  | "addIban"
  | "companyDetails";

export interface TodayAction {
  key: TodayActionKey;
  href: string;
  /** Waarden voor de vertaalde zin (aantal, bedrag, datum...). */
  values: Record<string, string | number>;
  tone: "urgent" | "money" | "info";
}

export interface TodayInput {
  now: Date;
  lateInvoices: { count: number; total: number };
  draftInvoices: number;
  unbilledHoursValue: number;
  unbilledHours: number;
  expiringQuotes: number;
  hasAnyInvoice: boolean;
  hasIban: boolean;
  hasCompanyDetails: boolean;
  /** Bedrag formatteren in de taal van de gebruiker. */
  money: (n: number) => string;
  /** Datum formatteren in de taal van de gebruiker. */
  date: (d: Date) => string;
}

export const MAX_TODAY_ACTIONS = 4;

/**
 * Btw-aangifte per kwartaal: uiterlijk de laatste dag van de maand na het
 * kwartaal (31 jan, 30 apr, 31 jul, 31 okt). Geeft het eerstvolgende moment
 * terug als dat binnen `withinDays` valt, anders null.
 */
export function upcomingVatDeadline(now: Date, withinDays = 21): { quarter: number; year: number; due: Date } | null {
  const y = now.getUTCFullYear();
  const candidates = [
    { quarter: 4, year: y - 1, due: new Date(Date.UTC(y, 1, 0)) }, // 31 januari
    { quarter: 1, year: y, due: new Date(Date.UTC(y, 4, 0)) }, // 30 april
    { quarter: 2, year: y, due: new Date(Date.UTC(y, 7, 0)) }, // 31 juli
    { quarter: 3, year: y, due: new Date(Date.UTC(y, 10, 0)) }, // 31 oktober
    { quarter: 4, year: y, due: new Date(Date.UTC(y + 1, 1, 0)) }, // 31 januari volgend jaar
  ];
  const today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  const next = candidates.find((c) => c.due.getTime() >= today);
  if (!next) return null;
  const daysLeft = Math.round((next.due.getTime() - today) / 86_400_000);
  return daysLeft <= withinDays ? next : null;
}

export function computeTodayActions(input: TodayInput): TodayAction[] {
  const actions: TodayAction[] = [];

  // 1. Geld dat binnen had moeten zijn.
  if (input.lateInvoices.count > 0) {
    actions.push({
      key: "lateInvoices",
      href: "/invoices?status=OVERDUE",
      tone: "urgent",
      values: { count: input.lateInvoices.count, amount: input.money(input.lateInvoices.total) },
    });
  }

  // 2. Wettelijke deadline die eraan komt.
  const vat = input.hasAnyInvoice ? upcomingVatDeadline(input.now) : null;
  if (vat) {
    actions.push({ key: "vatReturn", href: "/btw", tone: "urgent", values: { quarter: vat.quarter, year: vat.year, date: input.date(vat.due) } });
  }

  // 3. Werk dat nog geld moet opleveren.
  if (input.draftInvoices > 0) {
    actions.push({ key: "draftInvoices", href: "/invoices?status=DRAFT", tone: "money", values: { count: input.draftInvoices } });
  }
  if (input.unbilledHoursValue >= 1) {
    actions.push({
      key: "unbilledHours",
      href: "/invoices/new",
      tone: "money",
      values: { amount: input.money(input.unbilledHoursValue), hours: Math.round(input.unbilledHours * 10) / 10 },
    });
  }
  if (input.expiringQuotes > 0) {
    actions.push({ key: "expiringQuotes", href: "/quotes", tone: "money", values: { count: input.expiringQuotes } });
  }

  // 4. Eenmalige instellingen die facturen beter maken.
  if (!input.hasIban) actions.push({ key: "addIban", href: "/invoices/settings", tone: "info", values: {} });
  if (!input.hasCompanyDetails) actions.push({ key: "companyDetails", href: "/settings", tone: "info", values: {} });

  return actions.slice(0, MAX_TODAY_ACTIONS);
}
