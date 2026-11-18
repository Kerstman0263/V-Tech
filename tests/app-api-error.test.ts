import { describe, expect, it } from "vitest";
import { friendlyApiError, isDemoLocked } from "@/components/dashboard/api-error-text";

const base = { fallback: "Algemeen", demoLocked: "Demo" };

describe("friendlyApiError", () => {
  it("toont de Nederlandse servermelding in het Nederlands", () => {
    expect(friendlyApiError({ ...base, status: 422, data: { error: "Omschrijving is verplicht" }, locale: "nl" })).toBe("Omschrijving is verplicht");
  });

  it("toont in het Engels altijd de vertaalde terugval", () => {
    expect(friendlyApiError({ ...base, status: 422, data: { error: "Omschrijving is verplicht" }, locale: "en" })).toBe("Algemeen");
  });

  it("verbergt kale technische teksten", () => {
    for (const error of ["Validation failed", "Not found", "Unauthorized", "Forbidden"]) {
      expect(friendlyApiError({ ...base, status: 400, data: { error }, locale: "nl" })).toBe("Algemeen");
    }
  });

  it("toont geen interne codes", () => {
    expect(friendlyApiError({ ...base, status: 409, data: { error: "already_closed" }, locale: "nl" })).toBe("Algemeen");
  });

  it("gebruikt de eerste leesbare veldmelding", () => {
    const data = { error: "Validation failed", issues: { fieldErrors: { hours: ["Aantal uren moet groter dan 0 zijn"] } } };
    expect(friendlyApiError({ ...base, status: 400, data, locale: "nl" })).toBe("Aantal uren moet groter dan 0 zijn");
  });

  it("negeert Engelse zod-standaardteksten in veldmeldingen", () => {
    const data = { error: "Validation failed", issues: { fieldErrors: { hours: ["Number must be greater than 0"] } } };
    expect(friendlyApiError({ ...base, status: 400, data, locale: "nl" })).toBe("Algemeen");
  });

  it("geeft serverfouten de terugvaltekst", () => {
    expect(friendlyApiError({ ...base, status: 500, data: { error: "Dit is niet gelukt." }, locale: "nl" })).toBe("Algemeen");
  });

  it("herkent het slot op het demo-account, met of zonder code", () => {
    expect(isDemoLocked(403, { error: "In de demo kun je dit niet wijzigen", code: "demo_locked" })).toBe(true);
    expect(isDemoLocked(403, { error: "In de demo kun je dit niet wijzigen" })).toBe(true);
    expect(isDemoLocked(403, { error: "Geen toegang" })).toBe(false);
    expect(friendlyApiError({ ...base, status: 403, data: { code: "demo_locked" }, locale: "en" })).toBe("Demo");
  });
});
