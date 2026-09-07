import { describe, it, expect } from "vitest";
import { can, assertCan, isAccountOwner, isPlatformAdmin, type PermissionUser } from "@/lib/permissions";
import { HttpError } from "@/lib/http-error";

// Rollen als test-fixtures.
const owner: PermissionUser = { id: "acc1", accountId: "acc1", role: "USER", teamRole: null };
const manager: PermissionUser = { id: "u2", accountId: "acc1", role: "USER", teamRole: "MANAGER" };
const member: PermissionUser = { id: "u3", accountId: "acc1", role: "USER", teamRole: "MEMBER" };
const platformAdmin: PermissionUser = { id: "u4", accountId: "acc1", role: "ADMIN", teamRole: "MEMBER" };

describe("can() — rol-gebaseerde rechten", () => {
  it("eigenaar mag alles binnen zijn account", () => {
    expect(can(owner, "financials")).toBe(true);
    expect(can(owner, "companySettings")).toBe(true);
    expect(can(owner, "manageTeam")).toBe(true);
    expect(can(owner, "viewActivity")).toBe(true);
  });

  it("manager: wel team/activiteit, GEEN financiën of instellingen", () => {
    expect(can(manager, "manageTeam")).toBe(true);
    expect(can(manager, "viewActivity")).toBe(true);
    expect(can(manager, "financials")).toBe(false);
    expect(can(manager, "companySettings")).toBe(false);
  });

  it("medewerker: helemaal niets van de bovenstaande capabilities", () => {
    expect(can(member, "financials")).toBe(false);
    expect(can(member, "companySettings")).toBe(false);
    expect(can(member, "manageTeam")).toBe(false);
    expect(can(member, "viewActivity")).toBe(false);
  });

  it("platformbeheerder (ADMIN/OWNER) mag alles, ongeacht teamRole", () => {
    expect(can(platformAdmin, "financials")).toBe(true);
    expect(can(platformAdmin, "manageTeam")).toBe(true);
    expect(can({ ...member, role: "OWNER" }, "financials")).toBe(true);
  });
});

describe("assertCan()", () => {
  it("gooit HttpError 403 als het niet mag", () => {
    try {
      assertCan(member, "financials");
      throw new Error("had moeten gooien");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(403);
    }
  });

  it("gooit niet als het wel mag", () => {
    expect(() => assertCan(owner, "financials")).not.toThrow();
    expect(() => assertCan(manager, "manageTeam")).not.toThrow();
  });
});

describe("helpers", () => {
  it("isAccountOwner", () => {
    expect(isAccountOwner(owner)).toBe(true);
    expect(isAccountOwner(member)).toBe(false);
  });
  it("isPlatformAdmin", () => {
    expect(isPlatformAdmin(platformAdmin)).toBe(true);
    expect(isPlatformAdmin(owner)).toBe(false);
  });
});

describe("rechtenmatrix (4 vinkjes)", () => {
  it("standaard per rol: manager = uren goedkeuren + team, boekhouder = facturatie + exports", () => {
    expect(can(manager, "approveHours")).toBe(true);
    expect(can(manager, "exports")).toBe(false);
    expect(can(member, "approveHours")).toBe(false);
    expect(can({ ...member, teamRole: "ACCOUNTANT" }, "exports")).toBe(true);
    expect(can({ ...member, teamRole: "ACCOUNTANT" }, "approveHours")).toBe(false);
  });
  it("eigen matrix overschrijft de rol-standaard", () => {
    const custom = { ...member, permissionsCustom: true, permissions: ["financials", "exports"] };
    expect(can(custom, "financials")).toBe(true);
    expect(can(custom, "exports")).toBe(true);
    expect(can(custom, "manageTeam")).toBe(false);
    const strippedManager = { ...manager, permissionsCustom: true, permissions: [] };
    expect(can(strippedManager, "manageTeam")).toBe(false);
    expect(can(strippedManager, "viewActivity")).toBe(false);
  });
  it("matrix zonder permissionsCustom wordt genegeerd; onbekende rechten ook", () => {
    expect(can({ ...member, permissions: ["financials"] }, "financials")).toBe(false);
    expect(can({ ...member, permissionsCustom: true, permissions: ["companySettings"] }, "companySettings")).toBe(false);
  });
});

describe("boekhouder (ACCOUNTANT)", () => {
  const accountant = { id: "acc", accountId: "owner", role: "USER", teamRole: "ACCOUNTANT" };
  it("ziet de financiën, maar geen personeel of bedrijfsinstellingen", () => {
    expect(can(accountant, "financials")).toBe(true);
    expect(can(accountant, "manageTeam")).toBe(false);
    expect(can(accountant, "viewActivity")).toBe(false);
    expect(can(accountant, "companySettings")).toBe(false);
  });
});
