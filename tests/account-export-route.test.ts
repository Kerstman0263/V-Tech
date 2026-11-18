import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import type { ExportSource } from "@/lib/account-export";

// GET /api/account/export: rechten, account uit de sessie, en het
// activiteitenlog pas als de ZIP compleet is. Met mocks, zonder database.

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  auditCreate: vi.fn(),
  source: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mock.auth }));
vi.mock("@/lib/db", () => ({ db: { auditLog: { create: mock.auditCreate } } }));
vi.mock("@/lib/account-export-source", () => ({ prismaExportSource: mock.source }));

import { GET } from "@/app/api/account/export/route";

function fakeSource(overrides: Partial<ExportSource> = {}): ExportSource {
  return {
    rows: async (table) => (table === "support" ? [{ id: "s1", body: "supportvraag" }] : table === "team" ? [{ id: "owner", email: "eigenaar@voorbeeld.test" }] : []),
    files: async () => [],
    invoices: async () => [],
    context: async () => ({ ownerEmail: "eigenaar@voorbeeld.test", company: null, settings: null }),
    ...overrides,
  };
}

const session = (user: Record<string, unknown>) => mock.auth.mockResolvedValue({ user: { name: null, email: "x@voorbeeld.test", role: "USER", ...user } });
const actions = () => mock.auditCreate.mock.calls.map(([arg]) => arg.data as { action: string; accountId: string });

beforeEach(() => {
  vi.resetAllMocks();
  mock.auditCreate.mockResolvedValue({});
  mock.source.mockReturnValue(fakeSource());
});
afterEach(() => { vi.restoreAllMocks(); });

describe("GET /api/account/export", () => {
  it("niet ingelogd: 401", async () => {
    mock.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mock.source).not.toHaveBeenCalled();
  });

  it("een teamlid zonder exportrecht: 403, en de database wordt niet gelezen", async () => {
    session({ id: "medewerker", accountId: "owner", teamRole: "MEMBER" });
    expect((await GET()).status).toBe(403);
    expect(mock.source).not.toHaveBeenCalled();
  });

  it("een boekhouder: alleen het account uit de sessie, en als niet-eigenaar (geen support of team)", async () => {
    session({ id: "boekhouder", accountId: "owner", teamRole: "ACCOUNTANT" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(mock.source).toHaveBeenCalledWith("owner");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(files["LEESMIJ.txt"]).toBeDefined();
    expect(files["gegevens/facturen.json"]).toBeDefined();
    expect(files["gegevens/support-berichten.json"]).toBeUndefined();
    expect(files["gegevens/team.json"]).toBeUndefined();
  });

  it("de eigenaar krijgt ook support en team", async () => {
    session({ id: "owner", accountId: "owner" });
    const files = unzipSync(new Uint8Array(await (await GET()).arrayBuffer()));
    expect(files["gegevens/support-berichten.json"]).toBeDefined();
    expect(files["gegevens/team.json"]).toBeDefined();
  });

  it("logt 'geëxporteerd' pas als de ZIP compleet is", async () => {
    session({ id: "owner", accountId: "owner" });
    const res = await GET();
    expect(actions()).toEqual([]);
    await res.arrayBuffer();
    expect(actions()).toEqual([expect.objectContaining({ action: "account.exported", accountId: "owner" })]);
  });

  it("de database faalt vóór de eerste byte: een nette 500, geen kapotte ZIP", async () => {
    session({ id: "owner", accountId: "owner" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mock.source.mockReturnValue(fakeSource({ context: async () => { throw new Error("db down"); } }));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toHaveProperty("error");
    expect(actions()).toEqual([]);
  });

  it("de export breekt halverwege af: geen 'geëxporteerd', wel 'export mislukt'", async () => {
    session({ id: "owner", accountId: "owner" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mock.source.mockReturnValue(fakeSource({ rows: async (table) => { if (table === "invoices") throw new Error("db down"); return []; } }));
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.arrayBuffer()).rejects.toThrow();
    expect(actions().map((a) => a.action)).toEqual(["account.export_failed"]);
  });
});
