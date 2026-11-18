import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// De Prisma-bron van de volledige export, met een nep-database: elke query moet
// beperkt zijn tot het account uit de sessie, in delen lezen, en geheime of
// grote velden nooit ophalen. Zonder echte database.

type Call = { model: string; method: string; args: Record<string, unknown> };
const calls = vi.hoisted(() => [] as Call[]);

vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get: (_t, model: string) => new Proxy({}, {
      get: (_m, method: string) => async (args: Record<string, unknown>) => {
        calls.push({ model, method, args });
        return method === "findMany" ? [] : null;
      },
    }),
  }),
}));

import { prismaExportSource } from "@/lib/account-export-source";
import { EXPORT_TABLES, NEVER_EXPORTED_FIELDS } from "@/lib/account-export";

const ACCOUNT = "acc_sessie";
const lcFirst = (s: string) => s[0].toLowerCase() + s.slice(1);

/** Velden per model uit prisma/schema.prisma. */
const schema = readFileSync(join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
const fieldsOf = (model: string): string[] => {
  const m = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  if (!m) throw new Error(`model ${model} niet gevonden`);
  return m[1].split("\n").map((l) => /^\s+(\w+)\s/.exec(l)?.[1]).filter((f): f is string => !!f);
};

/** Wordt dit veld door de query opgehaald? */
function fetches(args: Record<string, unknown>, field: string): boolean {
  const select = args.select as Record<string, unknown> | undefined;
  if (select) return !!select[field];
  const omit = args.omit as Record<string, unknown> | undefined;
  return omit?.[field] !== true;
}

const scoped = (args: Record<string, unknown>) => JSON.stringify(args.where);

beforeEach(() => { calls.length = 0; });

describe("prismaExportSource", () => {
  const source = prismaExportSource(ACCOUNT);

  for (const spec of EXPORT_TABLES) {
    it(`${spec.key}: alleen het eigen account, in delen, zonder geheimen`, async () => {
      await source.rows(spec.key, null, 50);
      await source.rows(spec.key, "cursor_1", 50);
      expect(calls).toHaveLength(2);
      const [first, next] = calls;
      expect(first.model).toBe(lcFirst(spec.model));
      expect(first.method).toBe("findMany");

      // Afgebakend op het account uit de sessie.
      const where = scoped(first.args);
      if (spec.key === "team") {
        expect(where).toContain(`"id":"${ACCOUNT}"`);
        expect(where).toContain(`"ownerId":"${ACCOUNT}"`);
      } else if (spec.key === "activity") {
        expect(first.args.where).toMatchObject({ accountId: ACCOUNT, platform: false });
      } else if (spec.key === "invoiceLines") {
        expect(first.args.where).toMatchObject({ invoice: { userId: ACCOUNT } });
      } else if (spec.key === "quoteLines") {
        expect(first.args.where).toMatchObject({ quote: { userId: ACCOUNT } });
      } else {
        expect(first.args.where).toMatchObject({ userId: ACCOUNT });
      }

      // In delen, op id.
      expect(first.args).toMatchObject({ orderBy: { id: "asc" }, take: 50 });
      expect(scoped(next.args)).toContain(`"id":{"gt":"cursor_1"}`);

      // Geheime velden uit het schema worden nooit opgehaald.
      const secretFields = fieldsOf(spec.model).filter((f) => NEVER_EXPORTED_FIELDS.includes(f));
      for (const field of secretFields) expect(fetches(first.args, field), `${spec.model}.${field}`).toBe(false);
      // Grote bestandsvelden komen alleen via de bestandsquery's.
      if (spec.fileRef) expect(fetches(first.args, spec.fileRef.field), spec.fileRef.field).toBe(false);
    });
  }

  it("het team: nooit wachtwoordhash, 2FA-geheim, back-upcodes of inbox-token", async () => {
    await source.rows("team", null, 10);
    for (const f of ["passwordHash", "totpSecret", "totpBackupCodes", "inboundToken"]) expect(fetches(calls[0].args, f), f).toBe(false);
    expect(calls[0].args.select).toBeDefined();
  });

  it("bestanden (bonnetjes, inbox, handtekeningen): alleen het eigen account, alleen de nodige velden", async () => {
    for (const kind of ["receipt", "inbox", "signature"] as const) await source.files(kind, "c1", 10);
    expect(calls.map((c) => c.model)).toEqual(["expense", "inboxItem", "quote"]);
    for (const c of calls) {
      expect(c.args.where).toMatchObject({ userId: ACCOUNT, id: { gt: "c1" } });
      expect(c.args.select).toBeDefined();
      for (const f of NEVER_EXPORTED_FIELDS) expect(fetches(c.args, f), `${c.model}.${f}`).toBe(false);
    }
  });

  it("facturen voor PDF en UBL: alleen het eigen account en geen concepten", async () => {
    await source.invoices(null, 25);
    expect(calls[0]).toMatchObject({ model: "invoice", args: { where: { userId: ACCOUNT, status: { not: "DRAFT" } }, take: 25 } });
  });

  it("context: alleen het e-mailadres van de eigenaar, geen andere velden van de gebruiker", async () => {
    await source.context();
    const user = calls.find((c) => c.model === "user")!;
    expect(user.args).toEqual({ where: { id: ACCOUNT }, select: { email: true } });
    for (const c of calls.filter((c) => c.model !== "user")) expect(c.args.where).toEqual({ userId: ACCOUNT });
  });

  it("geen enkele query noemt een ander account", async () => {
    for (const spec of EXPORT_TABLES) await source.rows(spec.key, null, 5);
    await source.context();
    for (const c of calls) expect(JSON.stringify(c.args.where)).toContain(ACCOUNT);
  });
});
