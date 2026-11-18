import { describe, expect, it, vi } from "vitest";

// lib/subscription praat met de database; hier testen we alleen de pure keuzes.
vi.mock("@/lib/db", () => ({ db: {} }));

import { DEMO_EMAIL, DemoLockedError, assertNotDemo, isDemoUser } from "@/lib/demo";
import { HttpError } from "@/lib/http-error";
import { errorResponse } from "@/lib/auth-helpers";
import { exportConfirmed } from "@/lib/account-deletion";
import { businessSubscriptionFix, TRIAL_DAYS } from "@/lib/subscription";
import { canDecideLeave } from "@/lib/leave-rights";
import { isRateLimited, recordHit } from "@/lib/rate-limit";
import { LOGIN_EMAIL_LIMIT, loginEmailBlocked, recordLoginFailure, verifyPassword } from "@/lib/login-guard";
import type { PermissionUser } from "@/lib/permissions";

// lib/auth-helpers importeert lib/auth (NextAuth); voor errorResponse is dat niet nodig.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

describe("demo-account", () => {
  it("herkent het demo-adres, ook met hoofdletters en spaties", () => {
    expect(isDemoUser({ email: DEMO_EMAIL })).toBe(true);
    expect(isDemoUser({ email: `  ${DEMO_EMAIL.toUpperCase()} ` })).toBe(true);
  });
  it("ziet andere of lege adressen niet als demo", () => {
    expect(isDemoUser({ email: "jan@bedrijf.nl" })).toBe(false);
    expect(isDemoUser({ email: "" })).toBe(false);
    expect(isDemoUser({ email: null })).toBe(false);
    expect(isDemoUser(null)).toBe(false);
    expect(isDemoUser(undefined)).toBe(false);
  });
  it("assertNotDemo gooit 403 met code demo_locked, alleen voor de demo", () => {
    expect(() => assertNotDemo({ email: "jan@bedrijf.nl" })).not.toThrow();
    try {
      assertNotDemo({ email: DEMO_EMAIL });
      throw new Error("had moeten gooien");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err).toBeInstanceOf(DemoLockedError);
      expect((err as HttpError).status).toBe(403);
      expect((err as HttpError).message).toBe("In de demo kun je dit niet wijzigen");
      expect((err as DemoLockedError).code).toBe("demo_locked");
    }
  });
  it("errorResponse geeft de code mee aan de interface", async () => {
    const res = errorResponse(new DemoLockedError());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "In de demo kun je dit niet wijzigen", code: "demo_locked" });
    const plain = errorResponse(new HttpError(404, "Niet gevonden"));
    expect(await plain.json()).toEqual({ error: "Niet gevonden" });
  });
});

describe("account verwijderen vraagt een export-bevestiging", () => {
  it("alleen een letterlijke true telt", () => {
    expect(exportConfirmed({ exportConfirmed: true, password: "x" })).toBe(true);
    expect(exportConfirmed({ exportConfirmed: "true" })).toBe(false);
    expect(exportConfirmed({ exportConfirmed: 1 })).toBe(false);
    expect(exportConfirmed({ password: "x" })).toBe(false);
    expect(exportConfirmed(null)).toBe(false);
    expect(exportConfirmed("exportConfirmed")).toBe(false);
  });
});

describe("overstap naar bedrijf: abonnement en betaling lopen niet uit elkaar", () => {
  const NOW = new Date("2026-11-18T10:00:00Z");
  const trialEnd = new Date(NOW.getTime() + TRIAL_DAYS * 86_400_000);

  it("zonder abonnement: Business in proef", () => {
    expect(businessSubscriptionFix(null, NOW)).toEqual({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: trialEnd });
  });
  it("een ACTIEF zzp-plan wordt géén actief Business, maar een proef", () => {
    for (const plan of ["FREE", "GROWTH", "PRO", "WEBSHOP"] as const) {
      expect(businessSubscriptionFix({ plan, status: "ACTIVE", trialEndsAt: null }, NOW), plan).toEqual({
        plan: "BUSINESS",
        status: "TRIALING",
        trialEndsAt: trialEnd,
      });
    }
  });
  it("opgezegd of achterstallig zzp-plan: ook een verse proef", () => {
    expect(businessSubscriptionFix({ plan: "PRO", status: "CANCELED", trialEndsAt: null }, NOW)?.status).toBe("TRIALING");
    expect(businessSubscriptionFix({ plan: "GROWTH", status: "PAST_DUE", trialEndsAt: null }, NOW)?.status).toBe("TRIALING");
  });
  it("een actief bedrijfsplan blijft precies zoals het is", () => {
    expect(businessSubscriptionFix({ plan: "BUSINESS", status: "ACTIVE", trialEndsAt: null }, NOW)).toBeNull();
    expect(businessSubscriptionFix({ plan: "BUSINESS_PLUS", status: "ACTIVE", trialEndsAt: null }, NOW)).toBeNull();
  });
  it("lopende of verlopen bedrijfsproef met einddatum: niets veranderen", () => {
    const end = new Date(NOW.getTime() - 86_400_000);
    expect(businessSubscriptionFix({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: end }, NOW)).toBeNull();
  });
  it("bedrijfsproef zonder einddatum krijgt er een", () => {
    expect(businessSubscriptionFix({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: null }, NOW)).toEqual({
      plan: "BUSINESS",
      status: "TRIALING",
      trialEndsAt: trialEnd,
    });
  });
});

describe("verlof: wie mag beslissen", () => {
  const owner: PermissionUser = { id: "acc1", accountId: "acc1", role: "USER", teamRole: null };
  const manager: PermissionUser = { id: "u2", accountId: "acc1", role: "USER", teamRole: "MANAGER" };
  const member: PermissionUser = { id: "u3", accountId: "acc1", role: "USER", teamRole: "MEMBER" };
  const accountant: PermissionUser = { id: "u4", accountId: "acc1", role: "USER", teamRole: "ACCOUNTANT" };
  const memberWithHours: PermissionUser = { ...member, permissionsCustom: true, permissions: ["approveHours"] };
  const managerWithout: PermissionUser = { ...manager, permissionsCustom: true, permissions: [] };

  it("eigenaar en leidinggevende wel, medewerker en boekhouder niet", () => {
    expect(canDecideLeave(owner)).toBe(true);
    expect(canDecideLeave(manager)).toBe(true);
    expect(canDecideLeave(member)).toBe(false);
    expect(canDecideLeave(accountant)).toBe(false);
  });
  it("volgt een persoonlijk ingestelde rechtenmatrix, niet alleen de rolnaam", () => {
    expect(canDecideLeave(memberWithHours)).toBe(true);
    expect(canDecideLeave(managerWithout)).toBe(false);
  });
});

describe("rate-limit: kijken zonder tellen", () => {
  it("isRateLimited telt niet mee; recordHit wel", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(isRateLimited(key, 3, 60_000)).toBe(false);
    recordHit(key, 60_000);
    recordHit(key, 60_000);
    expect(isRateLimited(key, 3, 60_000)).toBe(false);
    recordHit(key, 60_000);
    expect(isRateLimited(key, 3, 60_000)).toBe(true);
  });
});

describe("inloggen: limiet per e-mailadres over alle IP's", () => {
  it("blokkeert na te veel mislukte pogingen, hoofdletterongevoelig", () => {
    const email = `iemand-${Math.random()}@bedrijf.nl`;
    for (let i = 0; i < LOGIN_EMAIL_LIMIT - 1; i++) recordLoginFailure(email);
    expect(loginEmailBlocked(email)).toBe(false);
    recordLoginFailure(email.toUpperCase());
    expect(loginEmailBlocked(email)).toBe(true);
  });
  it("de demo (openbaar wachtwoord) wordt nooit geblokkeerd", () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT * 2; i++) recordLoginFailure(DEMO_EMAIL);
    expect(loginEmailBlocked(DEMO_EMAIL)).toBe(false);
  });
  it("onbekende gebruiker: altijd false, ook als het 'wachtwoord' toevallig de dummy zou raken", async () => {
    expect(await verifyPassword("wat-dan-ook", null)).toBe(false);
    expect(await verifyPassword("wat-dan-ook", undefined)).toBe(false);
  });
});
