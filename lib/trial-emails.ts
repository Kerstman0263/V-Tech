import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { emailBadge, emailButton, escapeHtml, renderEmail } from "@/lib/email-templates";
import { trialDaysLeft } from "@/lib/subscription";

/**
 * Proefperiode-herinneringen voor bedrijfsaccounts (dagelijkse cron).
 *
 * Drempels: 7 dagen, 3 dagen, 1 dag vóór het einde, en 0 = verlopen.
 * `Subscription.trialNoticeDays` onthoudt de laatst verstuurde drempel zodat
 * elke mail precies één keer gaat, ook als de cron een dag overslaat
 * (dan wordt de laagste nog niet verstuurde drempel gebruikt).
 */
export const TRIAL_NOTICE_STEPS = [7, 3, 1, 0] as const;
export type TrialNoticeStep = (typeof TRIAL_NOTICE_STEPS)[number];

/**
 * Welke herinnering is nu aan de beurt? null = niets sturen.
 * Puur en getest; los van de database.
 */
export function trialNoticeDue(daysLeft: number, lastNotice: number | null): TrialNoticeStep | null {
  // Laagste drempel die al bereikt is (daysLeft <= drempel)
  const reached = TRIAL_NOTICE_STEPS.filter((s) => daysLeft <= s);
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

/** Verstuurt alle proef-herinneringen die vandaag aan de beurt zijn. */
export async function runTrialReminders(now: Date = new Date()): Promise<{ scanned: number; sent: number; failed: number }> {
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
