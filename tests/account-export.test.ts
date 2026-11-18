import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { Decimal } from "@prisma/client/runtime/library";
import {
  EXPORT_TABLES,
  NEVER_EXPORTED_FIELDS,
  OWNER_ACCESS,
  buildAccountExport,
  exportAccessFor,
  tablesFor,
  csvValue,
  parseDataUrl,
  safeFileName,
  stripSecrets,
  toCsv,
  zipEntries,
  type ExportAccess,
  type ExportContext,
  type ExportFile,
  type ExportInvoice,
  type ExportRow,
  type ExportSource,
  type ExportTableKey,
} from "@/lib/account-export";
import { encrypt } from "@/lib/encryption";

// Volledige export: welke tabellen erin zitten, dat geheimen er nooit in komen,
// dat versleutelde velden leesbaar zijn en dat bestanden en facturen meekomen.
// Puur: een nep-bron in plaats van de database.

const KEY = "a".repeat(64);
const PNG = "data:image/png;base64," + Buffer.from("png-bytes").toString("base64");
const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 bon").toString("base64");
const SECRET_VALUES = ["$2a$10$hash-van-wachtwoord", "totp-geheim-versleuteld", "backup-code-hash", "inbox-token-geheim", "offerte-token-geheim", "webshop-sleutel-versleuteld", "dedupe-hash-waarde"];

function invoice(overrides: Partial<ExportInvoice> = {}): ExportInvoice {
  return {
    id: "inv1", invoiceNumber: "2026-0001", status: "SENT", issueDate: new Date("2026-03-01T00:00:00Z"), dueDate: new Date("2026-03-15T00:00:00Z"),
    currency: "EUR", subtotal: 100, vatAmount: 21, total: 121, notes: null,
    customer: { name: "Klant BV", address: encrypt("Klantstraat 1"), postalCode: "1234 AB", city: "Utrecht", country: "NL", vatNumber: null, email: null },
    lineItems: [{ description: "Werk", quantity: 1, unitPrice: 100, vatRate: 21, lineTotal: 100 }],
    ...overrides,
  };
}

function fakeSource(opts: { rows?: Partial<Record<ExportTableKey, ExportRow[]>>; files?: Partial<Record<"receipt" | "inbox" | "signature", ExportFile[]>>; invoices?: ExportInvoice[]; context?: Partial<ExportContext> } = {}) {
  const calls: { table: string; after: string | null }[] = [];
  const pageOf = <T extends object>(list: T[], after: string | null, take: number) =>
    list.filter((r) => after === null || String((r as { id?: unknown }).id) > after).slice(0, take);
  const source: ExportSource = {
    async rows(table, after, take) {
      calls.push({ table, after });
      return pageOf(opts.rows?.[table] ?? [], after, take);
    },
    async files(kind, after, take) {
      return pageOf(opts.files?.[kind] ?? [], after, take);
    },
    async invoices(after, take) {
      return pageOf(opts.invoices ?? [], after, take);
    },
    async context() {
      return {
        ownerEmail: "eigenaar@voorbeeld.test",
        company: null,
        settings: null,
        ...opts.context,
      };
    },
  };
  return { source, calls };
}

// Een boekhouder (standaardrechten: facturatie en exports) van account "owner".
const ACCOUNTANT_ACCESS = exportAccessFor({ id: "boekhouder", accountId: "owner", role: "USER", teamRole: "ACCOUNTANT" });

async function collect(source: ExportSource, access: ExportAccess = OWNER_ACCESS, pageSize?: { rows?: number; files?: number; invoices?: number }) {
  const chunks: Uint8Array[] = [];
  for await (const c of zipEntries(buildAccountExport(source, { access, now: new Date("2026-11-18T10:00:00Z"), pageSize }))) chunks.push(c);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const zip = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { zip.set(c, at); at += c.length; }
  return unzipSync(zip);
}

const text = (files: Record<string, Uint8Array>, path: string) => strFromU8(files[path]);

beforeEach(() => { vi.stubEnv("ENCRYPTION_KEY", KEY); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("volledige export: inhoud", () => {
  it("bevat voor elke administratietabel een JSON-bestand, en waar zinvol een CSV", async () => {
    const files = await collect(fakeSource().source);
    for (const t of EXPORT_TABLES) {
      expect(files[`gegevens/${t.file}.json`], t.file).toBeDefined();
      expect(JSON.parse(text(files, `gegevens/${t.file}.json`))).toEqual([]);
      if (t.csv !== false) expect(files[`gegevens/${t.file}.csv`], t.file).toBeDefined();
    }
    expect(files["LEESMIJ.txt"]).toBeDefined();
  });

  it("dekt elk model met userId/accountId/ownerId uit prisma/schema.prisma", () => {
    const schema = readFileSync(join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({ name: m[1], body: m[2] }));
    const owned = models.filter((m) => /^\s+(userId|accountId|ownerId)\s/m.test(m.body)).map((m) => m.name);
    // Bewust niet in de export: inlogtokens (geheim) en de supportdraad zelf
    // (alleen een status; de berichten staan wel in support-berichten).
    const EXCLUDED = ["AuthToken", "SupportThread"];
    const exported = new Set(EXPORT_TABLES.map((t) => t.model));
    expect(owned.length).toBeGreaterThan(20);
    for (const model of owned) expect(exported.has(model) || EXCLUDED.includes(model), `${model} ontbreekt in EXPORT_TABLES`).toBe(true);
    // En andersom: elk model in de export bestaat echt in het schema.
    const names = new Set(models.map((m) => m.name));
    for (const t of EXPORT_TABLES) expect(names.has(t.model), t.model).toBe(true);
    // De regels van facturen en offertes hebben geen userId, maar horen er wel bij.
    expect(exported.has("InvoiceLineItem") && exported.has("QuoteLineItem")).toBe(true);
  });

  it("support-berichten alleen voor de eigenaar, niet voor een boekhouder met exportrecht", async () => {
    const rows = { support: [{ id: "s1", body: "Vraag over btw" }] };
    expect((await collect(fakeSource({ rows }).source))["gegevens/support-berichten.json"]).toBeDefined();
    const accountant = await collect(fakeSource({ rows }).source, ACCOUNTANT_ACCESS);
    expect(accountant["gegevens/support-berichten.json"]).toBeUndefined();
    expect(Object.values(accountant).some((f) => strFromU8(f).includes("Vraag over btw"))).toBe(false);
  });

  it("LEESMIJ legt de bewaarplicht van 7 jaar uit en wat waar staat", async () => {
    const readme = text(await collect(fakeSource().source), "LEESMIJ.txt");
    expect(readme).toContain("7 JAAR");
    expect(readme).toContain("artikel 52");
    expect(readme).toContain("gegevens/");
    expect(readme).toContain("bonnetjes/");
    expect(readme).toContain("facturen/pdf/");
    expect(readme).toContain("auditfile");
  });

  it("leest grote tabellen in delen, voor JSON en CSV allebei, en mist geen rij", async () => {
    const expenses = ["e1", "e2", "e3", "e4", "e5"].map((id) => ({ id, vendor: `Leverancier ${id}` }));
    const { source, calls } = fakeSource({ rows: { expenses } });
    const files = await collect(source, OWNER_ACCESS, { rows: 2 });
    expect(JSON.parse(text(files, "gegevens/uitgaven.json")).map((r: ExportRow) => r.id)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    // Eerst de JSON-ronde, dan de CSV-ronde: nooit een hele tabel tegelijk in het geheugen.
    expect(calls.filter((c) => c.table === "expenses").map((c) => c.after)).toEqual([null, "e2", "e4", null, "e2", "e4"]);
    const csv = text(files, "gegevens/uitgaven.csv").trim().split("\r\n");
    expect(csv).toHaveLength(6);
    expect(csv[0]).toBe('"id";"vendor";"bonnetjeBestand"');
    expect([...files["gegevens/uitgaven.csv"].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM voor Excel
    expect(csv[5]).toContain("Leverancier e5");
  });

  it("een lege tabel: geen tweede ronde voor de CSV, wel een kopregel", async () => {
    const { source, calls } = fakeSource();
    const files = await collect(source);
    expect(calls.filter((c) => c.table === "customers")).toHaveLength(1);
    expect([...files["gegevens/klanten.csv"]]).toEqual([0xef, 0xbb, 0xbf, 0x0d, 0x0a]);
  });
});

describe("volledige export: rechten van een teamlid", () => {
  const personnel = {
    team: [{ id: "owner", email: "eigenaar@voorbeeld.test", hourlyCost: new Decimal("41.25") }, { id: "m1", email: "medewerker@voorbeeld.test", hourlyCost: new Decimal("23.75") }],
    leaveRequests: [{ id: "l1", requesterId: "m1", type: "SICK", note: "griep-ziekmelding" }],
    leaveBalances: [{ id: "lb1", personId: "m1", year: 2026, hours: 200 }],
    tasks: [{ id: "t1", title: "taak-van-medewerker" }],
    activity: [{ id: "a1", action: "invoice.sent", actorName: "activiteit-van-medewerker" }],
    invoices: [{ id: "inv1", invoiceNumber: "2026-0001" }],
  };
  const all = (files: Record<string, Uint8Array>) => Object.values(files).map((f) => strFromU8(f)).join("\n");

  it("een boekhouder krijgt de administratie, maar geen team, verlof, taken, activiteitenlog of uurloon", async () => {
    expect(ACCOUNTANT_ACCESS).toMatchObject({ isOwner: false, financials: true, manageTeam: false, decideLeave: false, viewActivity: false });
    const files = await collect(fakeSource({ rows: personnel }).source, ACCOUNTANT_ACCESS);
    expect(files["gegevens/facturen.json"]).toBeDefined();
    for (const f of ["team", "verlofaanvragen", "verlofsaldi", "taken", "activiteitenlog", "support-berichten"]) {
      expect(files[`gegevens/${f}.json`], f).toBeUndefined();
      expect(files[`gegevens/${f}.csv`], f).toBeUndefined();
    }
    const everything = all(files);
    for (const secret of ["griep-ziekmelding", "SICK", "taak-van-medewerker", "activiteit-van-medewerker", "medewerker@voorbeeld.test", "23.75", "23,75"]) {
      expect(everything, secret).not.toContain(secret);
    }
    const readme = text(files, "LEESMIJ.txt");
    expect(readme).toContain("gegevens/verlofaanvragen: alleen de eigenaar of wie over verlof beslist");
    expect(readme).toContain("gegevens/activiteitenlog: alleen de eigenaar of wie het activiteitenlog mag zien");
  });

  it("een leidinggevende met exportrecht maar zonder facturatie: team zonder uurloon", async () => {
    const access = exportAccessFor({ id: "m2", accountId: "owner", role: "USER", teamRole: "MANAGER", permissionsCustom: true, permissions: ["manageTeam", "approveHours", "exports"] });
    expect(access).toMatchObject({ isOwner: false, financials: false, manageTeam: true, decideLeave: true, viewActivity: true });
    const files = await collect(fakeSource({ rows: personnel }).source, access);
    const team = JSON.parse(text(files, "gegevens/team.json"));
    expect(team.map((m: ExportRow) => m.email)).toEqual(["eigenaar@voorbeeld.test", "medewerker@voorbeeld.test"]);
    expect(team.every((m: ExportRow) => !("hourlyCost" in m))).toBe(true);
    expect(text(files, "gegevens/team.csv")).not.toContain("hourlyCost");
    expect(files["gegevens/verlofaanvragen.json"]).toBeDefined();
    expect(text(files, "LEESMIJ.txt")).toContain("Het bruto uurloon in gegevens/team");
  });

  it("de eigenaar krijgt alles, met het uurloon als getal in de CSV", async () => {
    expect(exportAccessFor({ id: "owner", accountId: "owner", role: "USER" })).toEqual(OWNER_ACCESS);
    expect(tablesFor(OWNER_ACCESS)).toHaveLength(EXPORT_TABLES.length);
    const files = await collect(fakeSource({ rows: personnel }).source);
    expect(text(files, "gegevens/team.csv")).toContain(`"23,75"`);
    expect(text(files, "gegevens/verlofaanvragen.json")).toContain("SICK");
    expect(text(files, "LEESMIJ.txt")).not.toContain("alleen de eigenaar of wie");
  });
});

describe("volledige export: geen geheimen", () => {
  it("wachtwoordhash, 2FA-geheim, tokens en sleutels komen nergens in de ZIP", async () => {
    const [hash, totp, backup, inboundToken, publicToken, credentials, dedupe] = SECRET_VALUES;
    const files = await collect(fakeSource({
      rows: {
        team: [{ id: "u1", email: "eigenaar@voorbeeld.test", passwordHash: hash, totpSecret: totp, totpBackupCodes: [backup], inboundToken }],
        quotes: [{ id: "q1", quoteNumber: "OFF-1", publicToken }],
        webshopConnections: [{ id: "w1", name: "winkel", credentials }],
        bankTransactions: [{ id: "b1", description: "betaling", dedupeHash: dedupe }],
        recurringInvoices: [{ id: "r1", lineItems: [{ description: "x", nested: { tokenHash: "genest-token" } }] }],
      },
    }).source);
    const all = Object.values(files).map((f) => strFromU8(f)).join("\n");
    for (const secret of [...SECRET_VALUES, "genest-token"]) expect(all).not.toContain(secret);
    for (const field of ["passwordHash", "totpSecret", "totpBackupCodes", "inboundToken", "publicToken", "credentials", "tokenHash"]) {
      expect(all).not.toContain(`"${field}"`);
    }
    expect(JSON.parse(text(files, "gegevens/team.json"))[0].email).toBe("eigenaar@voorbeeld.test");
  });

  it("stripSecrets werkt op elk niveau en laat datums en bedragen heel", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(stripSecrets({ a: 1, passwordHash: "x", list: [{ credentials: "y", ok: true }], when: d })).toEqual({ a: 1, list: [{ ok: true }], when: d });
    expect(NEVER_EXPORTED_FIELDS).toEqual(expect.arrayContaining(["passwordHash", "totpSecret", "totpBackupCodes", "credentials", "publicToken", "inboundToken"]));
  });
});

describe("volledige export: leesbaar", () => {
  it("ontsleutelt KvK, btw-nummer en adressen", async () => {
    const files = await collect(fakeSource({
      rows: {
        company: [{ id: "c1", name: "Mijn Zaak", kvkNumber: encrypt("12345678"), vatNumber: encrypt("NL001234567B01"), address: encrypt("Hoofdstraat 1") }],
        customers: [{ id: "k1", name: "Klant", address: encrypt("Klantstraat 9") }],
      },
    }).source);
    const company = JSON.parse(text(files, "gegevens/bedrijf.json"))[0];
    expect(company).toMatchObject({ kvkNumber: "12345678", vatNumber: "NL001234567B01", address: "Hoofdstraat 1" });
    expect(JSON.parse(text(files, "gegevens/klanten.json"))[0].address).toBe("Klantstraat 9");
    expect(text(files, "gegevens/klanten.csv")).toContain("Klantstraat 9");
  });

  it("een kapot versleuteld veld breekt de export niet af, maar staat in LEESMIJ", async () => {
    const files = await collect(fakeSource({ rows: { customers: [{ id: "k1", name: "Klant", address: "kapot:veld:zzz" }] } }).source);
    expect(JSON.parse(text(files, "gegevens/klanten.json"))[0].address).toBe("(kon niet worden ontsleuteld)");
    expect(text(files, "LEESMIJ.txt")).toContain("NIET ALLES");
  });

  it("CSV: Excel-NL, met bescherming tegen CSV-injectie", () => {
    const csv = toCsv([{ id: "k1", name: "=HYPERLINK(\"x\")", total: 12.5, paid: true, when: new Date("2026-02-03T00:00:00Z") }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"12,5"`);
    expect(csv).toContain(`"ja"`);
    expect(csvValue(null)).toBe(`""`);
  });

  it("CSV: een echte Prisma-Decimal wordt een getal met komma, geen tekst met aanhalingstekens", () => {
    expect(csvValue(new Decimal("12.50"))).toBe(`"12,5"`);
    expect(csvValue(new Decimal("-0.0000001"))).toBe(`"-0,0000001"`);
    expect(csvValue(new Decimal("1234567.89"))).toBe(`"1234567,89"`);
    expect(toCsv([{ id: "f1", total: new Decimal("121.00") }])).toContain(`"f1";"121"`);
  });
});

describe("volledige export: bestanden en facturen", () => {
  it("bonnetjes en inbox-bijlagen als losse bestanden, met oorspronkelijke naam en verwijzing", async () => {
    const files = await collect(fakeSource({
      rows: { expenses: [{ id: "e1", vendor: "Coolblue" }], inbox: [{ id: "i1", fileName: "bon.pdf" }, { id: "i2", fileName: "bon.pdf" }] },
      files: {
        receipt: [{ id: "e1", dataUrl: PNG, label: "2026-03-01 Coolblue" }],
        inbox: [{ id: "i1", dataUrl: PDF, fileName: "bon.pdf", mimeType: "application/pdf", label: "x" }, { id: "i2", dataUrl: PDF, fileName: "bon.pdf", mimeType: "application/pdf", label: "x" }],
      },
    }).source);
    expect(strFromU8(files["bonnetjes/2026-03-01 Coolblue.png"])).toBe("png-bytes");
    expect(strFromU8(files["inbox/bon.pdf"])).toBe("%PDF-1.4 bon");
    expect(files["inbox/bon (2).pdf"]).toBeDefined();
    expect(JSON.parse(text(files, "gegevens/uitgaven.json"))[0].bonnetjeBestand).toBe("bonnetjes/2026-03-01 Coolblue.png");
    expect(JSON.parse(text(files, "gegevens/inbox.json")).map((r: ExportRow) => r.bestand)).toEqual(["inbox/bon.pdf", "inbox/bon (2).pdf"]);
  });

  it("elke niet-concept-factuur als PDF en UBL; een concept niet", async () => {
    const files = await collect(fakeSource({
      invoices: [invoice(), invoice({ id: "inv2", invoiceNumber: "2026-0002", status: "DRAFT" })],
      context: { company: { id: "c1", name: "Mijn Zaak", kvkNumber: null, vatNumber: encrypt("NL001234567B01"), address: encrypt("Hoofdstraat 1"), postalCode: null, city: null, country: "NL", logo: null } },
    }).source);
    expect(strFromU8(files["facturen/pdf/2026-0001.pdf"].slice(0, 5))).toBe("%PDF-");
    const xml = text(files, "facturen/ubl/2026-0001.xml");
    expect(xml).toContain("2026-0001");
    expect(xml).toContain("Klantstraat 1");
    expect(xml).toContain("NL001234567B01");
    expect(files["facturen/pdf/2026-0002.pdf"]).toBeUndefined();
    expect(files["facturen/ubl/2026-0002.xml"]).toBeUndefined();
  });

  it("veilige bestandsnamen en data-URL's", () => {
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFileName("  ")).toBe("bestand");
    expect(parseDataUrl(PNG)?.mime).toBe("image/png");
    expect(parseDataUrl("geen data-url")).toBeNull();
  });
});
