import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import {
  GROWTH_TRIAL_NOTICE_STEPS,
  growthTrialCalendarDaysLeft,
  growthTrialCopy,
  growthTrialNoticeDue,
  trialNoticeDue,
} from "@/lib/trial-emails";
import { soloTrialSubscription } from "@/lib/subscription";

describe("Groei-proef-herinneringen", () => {
  it("een paar dagen voor het einde (3) en op de einddag (0), elk maar een keer", () => {
    expect(GROWTH_TRIAL_NOTICE_STEPS).toEqual([3, 0]);
    expect(trialNoticeDue(10, null, GROWTH_TRIAL_NOTICE_STEPS)).toBeNull();
    expect(trialNoticeDue(7, null, GROWTH_TRIAL_NOTICE_STEPS)).toBeNull();
    expect(trialNoticeDue(3, null, GROWTH_TRIAL_NOTICE_STEPS)).toBe(3);
    expect(trialNoticeDue(1, 3, GROWTH_TRIAL_NOTICE_STEPS)).toBeNull();
    expect(trialNoticeDue(0, 3, GROWTH_TRIAL_NOTICE_STEPS)).toBe(0);
    expect(trialNoticeDue(-1, null, GROWTH_TRIAL_NOTICE_STEPS)).toBe(0);
    expect(trialNoticeDue(-3, 0, GROWTH_TRIAL_NOTICE_STEPS)).toBeNull();
  });

  it("belooft geen online betaling zolang Saldova niet gelanceerd is", () => {
    for (const step of [3, 0] as const) {
      for (const locale of ["nl", "en"]) {
        const pre = growthTrialCopy(step, locale, "Studio <Test>", false);
        expect(pre.body).not.toMatch(/Kies een pakket bij|Choose a plan in/);
        expect(pre.body).toContain("Studio &lt;Test&gt;");
        const live = growthTrialCopy(step, locale, "Studio", true);
        expect(live.body).toMatch(/Instellingen → Abonnement|Settings → Subscription/);
      }
    }
  });

  it("noemt de echte gratis limieten en dat gegevens blijven", () => {
    const end = growthTrialCopy(0, "nl", "Studio", false);
    expect(end.body).toContain("tot 5 facturen per maand en tot 3 klanten");
    expect(end.body).toContain("blijft staan");
    expect(end.subject).toBe("Je Groei-proef bij Saldova is voorbij");
  });
});

describe("Groei-proef-herinneringen op kalenderdagen (cron 09:00 UTC)", () => {
  const cron = (iso: string) => new Date(`${iso}T09:00:00Z`);

  it("registratie na 09:00 UTC: eindmail op de einddag zelf, met 'vandaag je laatste dag'", () => {
    // Registratie 20-11 om 14:00 UTC -> proef eindigt 20-12 om 14:00 UTC (15:00 in Nederland)
    const ends = soloTrialSubscription(new Date("2026-11-20T14:00:00Z")).trialEndsAt!;
    expect(ends.toISOString()).toBe("2026-12-20T14:00:00.000Z");

    expect(growthTrialNoticeDue(ends, null, cron("2026-12-16"))).toBeNull();
    expect(growthTrialCalendarDaysLeft(ends, cron("2026-12-17"))).toBe(3);
    expect(growthTrialNoticeDue(ends, null, cron("2026-12-17"))).toBe(3); // echt 3 dagen voor de einddag
    expect(growthTrialNoticeDue(ends, 3, cron("2026-12-18"))).toBeNull();
    expect(growthTrialNoticeDue(ends, 3, cron("2026-12-19"))).toBeNull();
    expect(growthTrialCalendarDaysLeft(ends, cron("2026-12-20"))).toBe(0);
    expect(growthTrialNoticeDue(ends, 3, cron("2026-12-20"))).toBe(0); // op de einddag, niet een dag later
    expect(growthTrialNoticeDue(ends, 0, cron("2026-12-21"))).toBeNull();
  });

  it("registratie vóór 09:00 UTC: proef is bij de cron al afgelopen, eindmail dezelfde dag", () => {
    const ends = soloTrialSubscription(new Date("2026-11-20T07:00:00Z")).trialEndsAt!;
    expect(growthTrialNoticeDue(ends, 3, cron("2026-12-20"))).toBe(0);
    expect(ends < cron("2026-12-20")).toBe(true);
  });

  it("registratie net na middernacht in Nederland telt de Nederlandse kalenderdag", () => {
    // 20-11 23:30 UTC = 21-11 00:30 in Nederland -> einddag 21-12
    const ends = soloTrialSubscription(new Date("2026-11-20T23:30:00Z")).trialEndsAt!;
    expect(growthTrialCalendarDaysLeft(ends, cron("2026-12-20"))).toBe(1);
    expect(growthTrialNoticeDue(ends, 3, cron("2026-12-20"))).toBeNull();
    expect(growthTrialNoticeDue(ends, 3, cron("2026-12-21"))).toBe(0);
  });

  it("de mail op de einddag zegt 'vandaag' zolang de proef nog loopt, en 'voorbij' daarna", () => {
    for (const locale of ["nl", "en"]) {
      const today = growthTrialCopy(0, locale, "Studio", false, { at: "15:00" });
      expect(today.subject).toMatch(/Vandaag is je laatste Groei-dag|Today is your last day of Growth/);
      expect(today.body).toContain("15:00");
      expect(today.body).not.toMatch(/zijn voorbij|is over/);
      expect(today.body).not.toMatch(/Kies een pakket bij|Choose a plan in/);
      const ended = growthTrialCopy(0, locale, "Studio", false);
      expect(ended.subject).toMatch(/voorbij|ended/);
    }
  });
});

describe("trialNoticeDue", () => {
  it("stuurt niets zolang er meer dan 7 dagen over zijn", () => {
    expect(trialNoticeDue(30, null)).toBeNull();
    expect(trialNoticeDue(8, null)).toBeNull();
  });
  it("eerste herinnering op 7 dagen, daarna 3, 1 en verlopen", () => {
    expect(trialNoticeDue(7, null)).toBe(7);
    expect(trialNoticeDue(5, 7)).toBeNull();
    expect(trialNoticeDue(3, 7)).toBe(3);
    expect(trialNoticeDue(1, 3)).toBe(1);
    expect(trialNoticeDue(0, 1)).toBe(0);
    expect(trialNoticeDue(-4, 0)).toBeNull();
  });
  it("slaat overgeslagen drempels over en pakt de laagste bereikte (cron miste een dag)", () => {
    expect(trialNoticeDue(2, null)).toBe(3); // 2 dagen over: drempel 3 is bereikt, 1 nog niet
    expect(trialNoticeDue(2, 7)).toBe(3);
    expect(trialNoticeDue(1, 7)).toBe(1);
    expect(trialNoticeDue(-1, 3)).toBe(0);
  });
  it("verstuurt nooit twee keer dezelfde drempel", () => {
    expect(trialNoticeDue(7, 7)).toBeNull();
    expect(trialNoticeDue(0, 0)).toBeNull();
  });
});
