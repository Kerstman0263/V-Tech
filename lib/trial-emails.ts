import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { emailBadge, emailButton, escapeHtml, renderEmail } from "@/lib/email-templates";
import { SOLO_TRIAL_SINCE, TRIAL_DAYS, trialDaysLeft } from "@/lib/subscription";
import { isLaunched } from "@/lib/company";
import { PLANS } from "@/lib/plans";

/**
 * Proefperiode-herinneringen (dagelijkse cron): de Business-proef van
 * bedrijfsaccounts en de Groei-proef van nieuwe zzp-/webshop-accounts.
 *
 * Drempels: 7 dagen, 3 dagen, 1 dag vóór het einde, en 0 = verlopen.
 * `Subscription.trialNoticeDays` onthoudt de laatst verstuurde drempel zodat
 * elke mail precies één keer gaat, ook als de cron een dag overslaat
 * (dan wordt de laagste nog niet verstuurde drempel gebruikt).
 */
export const TRIAL_NOTICE_STEPS = [7, 3, 1, 0] as const;
export type TrialNoticeStep = (typeof TRIAL_NOTICE_STEPS)[number];

/**
 * Groei-proef (zzp/webshop): een herinnering 3 dagen voor het einde en een op
 * de einddag. Zelfde mechanisme en hetzelfde veld trialNoticeDays als bij
 * bedrijven, maar geteld in kalenderdagen in Nederland (growthTrialCalendarDaysLeft):
 * de cron draait één keer per dag (09:00 UTC, vercel.json), terwijl de proef op
 * het tijdstip van registratie eindigt. Met hele dagen van 24 uur zou de mail
 * "op de einddag" voor wie na 09:00 UTC registreerde pas de dag erna komen.
 */
export const GROWTH_TRIAL_NOTICE_STEPS = [3, 0] as const satisfies readonly TrialNoticeStep[];

const TRIAL_TIME_ZONE = "Europe/Amsterdam";
const DAY_MS = 86_400_000;

/** Kalenderdag in Nederland als dagnummer (dagen sinds 1970-01-01), voor verschillen tussen datums. */
function amsterdamDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TRIAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.round(Date.UTC(get("year"), get("month") - 1, get("day")) / DAY_MS);
}

/**
 * Kalenderdagen (Nederland) tot de einddag van de proef: 0 = de einddag zelf,
 * negatief = de einddag is al voorbij. Los van het tijdstip op die dag.
 */
export function growthTrialCalendarDaysLeft(trialEndsAt: Date, now: Date = new Date()): number {
  return amsterdamDayNumber(trialEndsAt) - amsterdamDayNumber(now);
}

/** Tijdstip (uu:mm, Nederlandse tijd) waarop de proef eindigt, voor de mail op de einddag. */
function trialEndTime(trialEndsAt: Date): string {
  return new Intl.DateTimeFormat("nl-NL", { timeZone: TRIAL_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(trialEndsAt);
}

/**
 * Welke herinnering is nu aan de beurt? null = niets sturen.
 * Puur en getest; los van de database.
 */
export function trialNoticeDue(
  daysLeft: number,
  lastNotice: number | null,
  steps: readonly TrialNoticeStep[] = TRIAL_NOTICE_STEPS,
): TrialNoticeStep | null {
  // Laagste drempel die al bereikt is (daysLeft <= drempel)
  const reached = steps.filter((s) => daysLeft <= s);
  if (reached.length === 0) return null;
  const step = reached[reached.length - 1]; // kleinste
  // Al verstuurd op deze of een lagere drempel -> niets
  if (lastNotice !== null && lastNotice <= step) return null;
  return step;
}

const BASE_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "https://saldova.vercel.app";

function copy(step: TrialNoticeStep, locale: string, companyName: string) {
  const en = locale === "en";
  const name = escapeHtml(companyName);
  if (step === 0) {
    return en
      ? {
          subject: `Your Saldova trial for ${companyName} has ended`,
          heading: "Your trial has ended",
          body: `<p>The 30-day Business trial for <strong>${name}</strong> is over. Your data is safe — choose Business or Business+ to keep working with your team.</p>`,
          cta: "Choose a plan",
        }
      : {
          subject: `De proefperiode van ${companyName} bij Saldova is voorbij`,
          heading: "Je proefperiode is voorbij",
          body: `<p>De 30 dagen Business-proef voor <strong>${name}</strong> is afgelopen. Je gegevens blijven bewaard — kies Business of Business+ om met je team verder te werken.</p>`,
          cta: "Kies een plan",
        };
  }
  const dayWord = en ? (step === 1 ? "day" : "days") : step === 1 ? "dag" : "dagen";
  return en
    ? {
        subject: `${step} ${dayWord} left in your Saldova trial`,
        heading: `${step} ${dayWord} left`,
        body: `<p>The Business trial for <strong>${name}</strong> ends in ${step} ${dayWord}. Pick Business or Business+ now and nothing changes for your team — no interruption, no data loss.</p>`,
        cta: "Choose a plan",
      }
    : {
        subject: `Nog ${step} ${dayWord} proefperiode bij Saldova`,
        heading: `Nog ${step} ${dayWord} proef`,
        body: `<p>De Business-proef voor <strong>${name}</strong> eindigt over ${step} ${dayWord}. Kies nu Business of Business+ en er verandert niets voor je team — geen onderbreking, geen dataverlies.</p>`,
        cta: "Kies een plan",
      };
}

/**
 * Teksten voor de Groei-proef. Eerlijk over wat er gebeurt: geen blokkade,
 * gegevens blijven, nieuwe facturen en klanten volgen de gratis limieten
 * (lib/plan-limits.ts), periodieke facturen pauzeren (lib/recurring.ts).
 * Zolang online betalen niet aan staat (isLaunched) beloven we geen betaling.
 */
export function growthTrialCopy(
  step: TrialNoticeStep,
  locale: string,
  companyName: string,
  launched: boolean,
  /** Alleen bij stap 0: eindigt de proef vandaag nog (de cron draait vóór het eindtijdstip)? */
  endsLaterToday: { at: string } | null = null,
) {
  const en = locale === "en";
  const name = escapeHtml(companyName);
  const { invoicesPerMonth, customers } = PLANS.FREE.limits;
  const limitsNl = `tot ${invoicesPerMonth} facturen per maand en tot ${customers} klanten`;
  const limitsEn = `up to ${invoicesPerMonth} invoices per month and up to ${customers} customers`;
  const keepNl = launched
    ? "<p>Wil je Groei houden? Kies een pakket bij Instellingen → Abonnement.</p>"
    : "<p>Betaalde pakketten zijn nog niet online te koop. Je hoeft niets te doen.</p>";
  const keepEn = launched
    ? "<p>Want to keep Growth? Choose a plan in Settings → Subscription.</p>"
    : "<p>Paid plans can't be bought online yet. You don't need to do anything.</p>";
  const afterNl = `<p>Je account wordt niet geblokkeerd. Alles wat je hebt gemaakt blijft staan, ook facturen en klanten boven de gratis limiet. Alleen nieuwe facturen en klanten gaan volgens de gratis limieten. Periodieke facturen horen bij Groei: heb je die ingesteld, dan pauzeren ze zodra ze aan de beurt zijn.</p>`;
  const afterEn = `<p>Your account is not blocked. Everything you made stays, including invoices and customers above the free limit. Only new invoices and customers follow the free limits. Recurring invoices are part of Growth: if you set any up, they pause when they are next due.</p>`;
  if (step === 0 && endsLaterToday) {
    const at = escapeHtml(endsLaterToday.at);
    return en
      ? {
          subject: "Today is your last day of Growth at Saldova",
          heading: "Your last day of Growth",
          body: `<p>The free Growth trial for <strong>${name}</strong> ends today at ${at} (Dutch time). After that you automatically continue on the free plan, with ${limitsEn}.</p>${afterEn}${keepEn}`,
          cta: "View plans",
        }
      : {
          subject: "Vandaag is je laatste Groei-dag bij Saldova",
          heading: "Vandaag je laatste dag Groei",
          body: `<p>De gratis Groei-proef voor <strong>${name}</strong> loopt vandaag om ${at} af. Daarna ga je vanzelf door op het gratis pakket, met ${limitsNl}.</p>${afterNl}${keepNl}`,
          cta: "Bekijk de pakketten",
        };
  }
  if (step === 0) {
    return en
      ? {
          subject: "Your Growth trial at Saldova has ended",
          heading: "You're now on the free plan",
          body: `<p>The 30-day Growth trial for <strong>${name}</strong> is over. Your account is not blocked: you simply continue on the free plan, with ${limitsEn}.</p><p>Everything you made stays, including invoices and customers above the free limit. Only new invoices and customers follow the free limits. Recurring invoices are part of Growth: if you set any up, they pause when they are next due.</p>${keepEn}`,
          cta: "View plans",
        }
      : {
          subject: "Je Groei-proef bij Saldova is voorbij",
          heading: "Je werkt nu verder op het gratis pakket",
          body: `<p>De 30 dagen Groei voor <strong>${name}</strong> zijn voorbij. Je account wordt niet geblokkeerd: je gaat vanzelf door op het gratis pakket, met ${limitsNl}.</p><p>Alles wat je hebt gemaakt blijft staan, ook facturen en klanten boven de gratis limiet. Alleen nieuwe facturen en klanten gaan volgens de gratis limieten. Periodieke facturen horen bij Groei: heb je die ingesteld, dan pauzeren ze zodra ze aan de beurt zijn.</p>${keepNl}`,
          cta: "Bekijk de pakketten",
        };
  }
  const dayWord = en ? (step === 1 ? "day" : "days") : step === 1 ? "dag" : "dagen";
  return en
    ? {
        subject: `${step} ${dayWord} of your Growth trial left`,
        heading: `${step} ${dayWord} of Growth left`,
        body: `<p>The free Growth trial for <strong>${name}</strong> ends in ${step} ${dayWord}. After that you automatically continue on the free plan, with ${limitsEn}. Your data stays.</p>${keepEn}`,
        cta: "View plans",
      }
    : {
        subject: `Nog ${step} ${dayWord} Groei-proef bij Saldova`,
        heading: `Nog ${step} ${dayWord} Groei`,
        body: `<p>De gratis Groei-proef voor <strong>${name}</strong> eindigt over ${step} ${dayWord}. Daarna ga je vanzelf door op het gratis pakket, met ${limitsNl}. Je gegevens blijven staan.</p>${keepNl}`,
        cta: "Bekijk de pakketten",
      };
}

/** Welke Groei-herinnering is nu aan de beurt? Puur: kalenderdagen in Nederland, null = niets sturen. */
export function growthTrialNoticeDue(trialEndsAt: Date, lastNotice: number | null, now: Date = new Date()): TrialNoticeStep | null {
  return trialNoticeDue(growthTrialCalendarDaysLeft(trialEndsAt, now), lastNotice, GROWTH_TRIAL_NOTICE_STEPS);
}

/** Groei-proef-herinneringen voor zzp- en webshop-accounts. */
async function runGrowthTrialReminders(now: Date): Promise<{ scanned: number; sent: number; failed: number }> {
  const subs = await db.subscription.findMany({
    where: {
      // Zelfde voorwaarden als hasSoloTrial (lib/subscription.ts): Gratis + proef, begonnen op of na SOLO_TRIAL_SINCE.
      plan: "FREE",
      status: "TRIALING",
      trialEndsAt: {
        gte: new Date(SOLO_TRIAL_SINCE.getTime() + TRIAL_DAYS * DAY_MS),
        // Alleen proeven die binnen een paar dagen aflopen (drempel 3 + speling) of al afliepen.
        lte: new Date(now.getTime() + 5 * DAY_MS),
      },
      // Wie de eindmail (0) al kreeg, hoeft niet elke dag opnieuw mee in de scan.
      OR: [{ trialNoticeDays: null }, { trialNoticeDays: { gt: 0 } }],
      user: { company: { accountType: "ZZP" } },
    },
    select: {
      userId: true,
      plan: true,
      status: true,
      trialEndsAt: true,
      trialNoticeDays: true,
      user: { select: { email: true, locale: true, company: { select: { name: true } } } },
    },
  });

  const launched = isLaunched();
  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    if (!sub.trialEndsAt) continue;
    const step = growthTrialNoticeDue(sub.trialEndsAt, sub.trialNoticeDays, now);
    if (step === null) continue;

    const en = sub.user.locale === "en";
    // Einddag, maar de proef loopt nog tot later vandaag: "vandaag je laatste dag", niet "voorbij".
    const endsLaterToday = step === 0 && sub.trialEndsAt > now ? { at: trialEndTime(sub.trialEndsAt) } : null;
    const c = growthTrialCopy(step, sub.user.locale, sub.user.company?.name || sub.user.email, launched, endsLaterToday);
    const html = renderEmail({
      heading: c.heading,
      preheader: c.subject,
      bodyHtml: `${emailBadge(step === 0 && !endsLaterToday ? (en ? "Trial ended" : "Proef voorbij") : en ? "Growth trial" : "Groei-proef", "brand")}${c.body}${emailButton(c.cta, `${BASE_URL()}/${sub.user.locale}/settings#abonnement`)}`,
    });
    try {
      await sendEmail({ required: true, to: sub.user.email, subject: c.subject, html });
      await db.subscription.update({ where: { userId: sub.userId }, data: { trialNoticeDays: step } });
      sent++;
    } catch (err) {
      console.error("growth_trial_email_failed", { type: err instanceof Error ? err.name : "UnknownError" });
      failed++;
    }
  }
  return { scanned: subs.length, sent, failed };
}

/** Verstuurt alle proef-herinneringen die vandaag aan de beurt zijn (bedrijven en de Groei-proef). */
export async function runTrialReminders(now: Date = new Date()): Promise<{ scanned: number; sent: number; failed: number }> {
  const business = await runBusinessTrialReminders(now);
  const growth = await runGrowthTrialReminders(now);
  return { scanned: business.scanned + growth.scanned, sent: business.sent + growth.sent, failed: business.failed + growth.failed };
}

/** Business-proef-herinneringen voor bedrijfsaccounts (ongewijzigd). */
async function runBusinessTrialReminders(now: Date): Promise<{ scanned: number; sent: number; failed: number }> {
  const subs = await db.subscription.findMany({
    where: { status: "TRIALING", trialEndsAt: { not: null }, user: { company: { accountType: "BEDRIJF" } } },
    select: {
      userId: true,
      plan: true,
      status: true,
      trialEndsAt: true,
      trialNoticeDays: true,
      user: { select: { email: true, locale: true, company: { select: { name: true } } } },
    },
  });

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    const daysLeft = trialDaysLeft(sub, now);
    if (daysLeft === null) continue;
    const step = trialNoticeDue(daysLeft, sub.trialNoticeDays);
    if (step === null) continue;

    const companyName = sub.user.company?.name || sub.user.email;
    const c = copy(step, sub.user.locale, companyName);
    const html = renderEmail({
      heading: c.heading,
      preheader: c.subject,
      bodyHtml: `${emailBadge(step === 0 ? (sub.user.locale === "en" ? "Trial ended" : "Proef voorbij") : sub.user.locale === "en" ? "Trial" : "Proefperiode", step <= 1 ? "amber" : "brand")}${c.body}${emailButton(c.cta, `${BASE_URL()}/${sub.user.locale}/settings`)}`,
    });
    try {
      await sendEmail({ required: true, to: sub.user.email, subject: c.subject, html });
      await db.subscription.update({ where: { userId: sub.userId }, data: { trialNoticeDays: step } });
      sent++;
    } catch (err) {
      console.error("trial_email_failed", { type: err instanceof Error ? err.name : "UnknownError" });
      failed++;
    }
  }
  return { scanned: subs.length, sent, failed };
}
