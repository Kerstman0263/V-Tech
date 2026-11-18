import { describe, expect, it } from "vitest";
import { approvalAfterEdit, canBill, hourlyRateChanged, initialApproval, isSubstantiveEdit } from "@/lib/time-approval";

describe("initialApproval", () => {
  it("zzp-uren en manager-uren hoeven geen goedkeuring", () => {
    expect(initialApproval({ isBedrijf: false, isManager: false })).toBe("NOT_REQUIRED");
    expect(initialApproval({ isBedrijf: true, isManager: true })).toBe("NOT_REQUIRED");
  });
  it("medewerker-uren in een bedrijf gaan ter beoordeling", () => {
    expect(initialApproval({ isBedrijf: true, isManager: false })).toBe("PENDING");
  });
});

describe("canBill", () => {
  it("alleen goedgekeurde of niet-beoordelingsplichtige uren zijn factureerbaar", () => {
    expect(canBill("NOT_REQUIRED")).toBe(true);
    expect(canBill("APPROVED")).toBe(true);
    expect(canBill("PENDING")).toBe(false);
    expect(canBill("REJECTED")).toBe(false);
  });
});

describe("approvalAfterEdit", () => {
  it("medewerker die goedgekeurde/afgekeurde uren wijzigt -> opnieuw beoordelen", () => {
    expect(approvalAfterEdit("APPROVED", false)).toBe("PENDING");
    expect(approvalAfterEdit("REJECTED", false)).toBe("PENDING");
    expect(approvalAfterEdit("PENDING", false)).toBe("PENDING");
  });
  it("manager-wijziging of niet-beoordelingsplichtig blijft ongewijzigd", () => {
    expect(approvalAfterEdit("APPROVED", true)).toBe("APPROVED");
    expect(approvalAfterEdit("NOT_REQUIRED", false)).toBe("NOT_REQUIRED");
  });
});

describe("isSubstantiveEdit", () => {
  it("alleen inhoudelijke velden tellen, niet de factuurstatus", () => {
    expect(isSubstantiveEdit({ hours: 3 })).toBe(true);
    expect(isSubstantiveEdit({ description: "x" })).toBe(true);
    expect(isSubstantiveEdit({})).toBe(false);
  });
});

describe("hourlyRateChanged", () => {
  it("een ongewijzigd tarief (zoals het formulier het meestuurt) telt niet als wijziging", () => {
    expect(hourlyRateChanged(85, "85.00")).toBe(false);
    expect(hourlyRateChanged(85, 85)).toBe(false);
    expect(hourlyRateChanged(undefined, "85.00")).toBe(false);
    expect(hourlyRateChanged(0, null)).toBe(false);
  });
  it("een ander bedrag is wel een wijziging", () => {
    expect(hourlyRateChanged(90, "85.00")).toBe(true);
    expect(hourlyRateChanged(85, null)).toBe(true);
    expect(hourlyRateChanged(85.01, "85.00")).toBe(true);
  });
});
