import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { trialNoticeDue } from "@/lib/trial-emails";

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
