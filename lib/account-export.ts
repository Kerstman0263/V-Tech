import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { csvCell } from "@/lib/csv-safe";
import { decrypt } from "@/lib/encryption";
import { generateInvoicePdf } from "@/lib/pdf";
import { generateUblInvoice } from "@/lib/ubl";
import { epcQrPayload, extractIban } from "@/lib/iban";
import { can, isAccountOwner, type PermissionUser } from "@/lib/permissions";
import { canDecideLeave } from "@/lib/leave-rights";

/**
 * Volledige export van een account als ZIP (bewaarplicht + AVG-dataportabiliteit).
 *
 * Opbouw (zie ook LEESMIJ.txt in de ZIP):
 *   gegevens/<onderdeel>.json + .csv   alle administratietabellen van het account
 *   bonnetjes/, inbox/                  bonnetjes en inbox-bijlagen als losse bestanden
 *   offertes/handtekeningen/, bedrijf/  handtekeningen bij offertes, het logo
 *   facturen/pdf/, facturen/ubl/        elke factuur die geen concept is, als PDF en e-factuur
 *   LEESMIJ.txt                         wat waar staat
 *
 * Dit bestand is puur: alle gegevens komen uit een ExportSource (in productie
 * lib/account-export-source.ts met Prisma, in de tests een nep-bron). Het levert
 * bestanden één voor één aan, zodat de route de ZIP als stream kan versturen
 * en nooit de hele administratie tegelijk in het geheugen staat.
 *
 * Geheimen gaan er nooit in: wachtwoordhashes, 2FA-geheimen en back-upcodes,
 * tokens, sleutels van koppelingen. Sessies staan niet in de database (JWT).
 *
 * Rechten: wie alleen het recht 'exports' heeft (bijv. de boekhouder) krijgt de
 * administratie, maar niet de personeelsgegevens die de app elders afschermt.
 * Het team, de taken, verlof (met ziekmeldingen), het activiteitenlog en het
 * bruto uurloon volgen dezelfde rechten als in de app (zie ExportAccess).
 */

export type ExportRow = Record<string, unknown>;

export type ExportTableKey =
  | "team"
  | "company"
  | "invoiceSettings"
  | "subscription"
  | "consents"
  | "customers"
  | "projects"
  | "invoices"
  | "invoiceLines"
  | "quotes"
  | "quoteLines"
  | "recurringInvoices"
  | "products"
  | "timeEntries"
  | "mileage"
  | "expenses"
  | "inbox"
  | "bankTransactions"
  | "assets"
  | "leaveRequests"
  | "leaveBalances"
  | "tasks"
  | "webshopConnections"
  | "webshopOrders"
  | "activity"
  | "support";

export type ExportFileKind = "receipt" | "inbox" | "signature" | "logo";

/**
 * Wie mag een onderdeel zien, net als elders in de app:
 *  - owner        alleen de eigenaar (support-berichten)
 *  - manageTeam   het team en de taken (app/api/team, app/api/tasks)
 *  - decideLeave  verlof van iedereen, met ziekmeldingen (app/api/leave)
 *  - viewActivity het activiteitenlog (/activiteit)
 */
export type ExportGate = "owner" | "manageTeam" | "decideLeave" | "viewActivity";

/** Wat degene die exporteert mag zien. In productie via exportAccessFor(sessie-user). */
export interface ExportAccess {
  isOwner: boolean;
  /** Facturatie inzien: nodig voor het bruto uurloon van teamleden. */
  financials: boolean;
  manageTeam: boolean;
  decideLeave: boolean;
  viewActivity: boolean;
}

/** De eigenaar (en een platformbeheerder) mag alles. */
export const OWNER_ACCESS: ExportAccess = { isOwner: true, financials: true, manageTeam: true, decideLeave: true, viewActivity: true };

export function exportAccessFor(user: PermissionUser): ExportAccess {
  return {
    isOwner: isAccountOwner(user),
    financials: can(user, "financials"),
    manageTeam: can(user, "manageTeam"),
    decideLeave: canDecideLeave(user),
    viewActivity: can(user, "viewActivity"),
  };
}

function gateOpen(gate: ExportGate | undefined, access: ExportAccess): boolean {
  if (gate === undefined) return true;
  if (gate === "owner") return access.isOwner;
  return access[gate];
}

/** De tabellen die deze persoon mag exporteren. */
export function tablesFor(access: ExportAccess): ExportTableSpec[] {
  return EXPORT_TABLES.filter((t) => gateOpen(t.requires, access));
}

const GATE_REASON: Record<ExportGate, string> = {
  owner: "alleen de eigenaar van het account kan dit exporteren",
  manageTeam: "alleen de eigenaar of wie het team beheert kan dit exporteren",
  decideLeave: "alleen de eigenaar of wie over verlof beslist kan dit exporteren",
  viewActivity: "alleen de eigenaar of wie het activiteitenlog mag zien kan dit exporteren",
};

export interface ExportTableSpec {
  key: ExportTableKey;
  /** Bestandsnaam zonder extensie, in de map gegevens/. */
  file: string;
  /** Uitleg voor LEESMIJ.txt. */
  about: string;
  /** Ook als CSV (standaard ja). */
  csv?: boolean;
  /** Prisma-model in prisma/schema.prisma (de test vergelijkt dit met het schema). */
  model: string;
  /** Velden die met lib/encryption zijn versleuteld en voor de export worden ontsleuteld. */
  encrypted?: readonly string[];
  /** Bestandsveld: de inhoud staat als los bestand in de ZIP; de rij krijgt het pad. */
  fileRef?: { kind: ExportFileKind; field: string; pathField: string };
  /** Alleen voor wie dit recht heeft (zie ExportGate); zonder: iedereen met het recht 'exports'. */
  requires?: ExportGate;
  /** Velden die alleen meegaan voor wie facturatie mag inzien (bruto uurloon). */
  financialFields?: readonly string[];
}

/** Alle administratietabellen van een account (alles met userId/accountId in prisma/schema.prisma). */
export const EXPORT_TABLES: readonly ExportTableSpec[] = [
  { key: "company", model: "Company", file: "bedrijf", csv: false, encrypted: ["kvkNumber", "vatNumber", "address"],
    fileRef: { kind: "logo", field: "logo", pathField: "logoBestand" },
    about: "Je bedrijfsgegevens: naam, rechtsvorm, KvK-nummer, btw-nummer en adres." },
  { key: "team", model: "User", file: "team", requires: "manageTeam", financialFields: ["hourlyCost"],
    about: "Jij en je teamleden: naam, e-mail, teamrol en rechten, en het bruto uurloon als je facturatie mag inzien. Zonder wachtwoorden en 2FA-gegevens." },
  { key: "invoiceSettings", model: "InvoiceSettings", file: "factuurinstellingen", csv: false,
    about: "Je instellingen voor facturen en offertes: nummering, standaard-btw, betaaltermijn, betaalinstructies en voettekst." },
  { key: "subscription", model: "Subscription", file: "abonnement", csv: false,
    about: "Je Saldova-abonnement: plan, status en datums." },
  { key: "consents", model: "Consent", file: "toestemmingen",
    about: "Welke voorwaarden en privacyverklaring je hebt geaccepteerd, met versie en datum." },
  { key: "customers", model: "Customer", file: "klanten", encrypted: ["address"],
    about: "Je klanten met adres en btw-nummer." },
  { key: "projects", model: "Project", file: "projecten", about: "Je projecten met uurtarief." },
  { key: "invoices", model: "Invoice", file: "facturen",
    about: "Al je facturen, ook concepten en creditfacturen: nummer, datums, status en bedragen. De regels staan in factuurregels." },
  { key: "invoiceLines", model: "InvoiceLineItem", file: "factuurregels", about: "De regels van elke factuur (kolom invoiceId hoort bij facturen)." },
  { key: "quotes", model: "Quote", file: "offertes",
    fileRef: { kind: "signature", field: "signatureData", pathField: "handtekeningBestand" },
    about: "Je offertes met status, akkoord, naam en IP-adres van de ondertekenaar. De getekende handtekening staat in offertes/handtekeningen/." },
  { key: "quoteLines", model: "QuoteLineItem", file: "offerteregels", about: "De regels van elke offerte (kolom quoteId hoort bij offertes)." },
  { key: "recurringInvoices", model: "RecurringInvoice", file: "periodieke-facturen", about: "Je periodieke facturen: klant, interval, volgende datum en de regels." },
  { key: "products", model: "Product", file: "producten", about: "Je producten en diensten met prijs en btw-tarief." },
  { key: "timeEntries", model: "TimeEntry", file: "uren", about: "Je urenregistratie, met goedkeuring en factuurkoppeling." },
  { key: "mileage", model: "MileageEntry", file: "ritten", about: "Je rittenregistratie (zakelijk en privé) met afstand en tarief." },
  { key: "expenses", model: "Expense", file: "uitgaven",
    fileRef: { kind: "receipt", field: "receipt", pathField: "bonnetjeBestand" },
    about: "Je uitgaven met btw. In de kolom bonnetjeBestand staat welk bestand in bonnetjes/ erbij hoort." },
  { key: "inbox", model: "InboxItem", file: "inbox",
    fileRef: { kind: "inbox", field: "data", pathField: "bestand" },
    about: "Wat er in je bonnetjes-inbox binnenkwam: afzender, onderwerp en status. In de kolom bestand staat welk bestand in inbox/ erbij hoort." },
  { key: "bankTransactions", model: "BankTransaction", file: "banktransacties", about: "Je geïmporteerde banktransacties en aan welke factuur ze gekoppeld zijn." },
  { key: "assets", model: "Asset", file: "activa", about: "Je bezittingen (activa) met aanschafprijs, restwaarde en looptijd voor de afschrijving." },
  { key: "leaveRequests", model: "LeaveRequest", file: "verlofaanvragen", requires: "decideLeave", about: "Verlofaanvragen en ziekmeldingen van jou en je team." },
  { key: "leaveBalances", model: "LeaveBalance", file: "verlofsaldi", requires: "decideLeave", about: "Het verlofbudget per persoon per jaar." },
  { key: "tasks", model: "Task", file: "taken", requires: "manageTeam", about: "Je taken en die van je team." },
  { key: "webshopConnections", model: "WebshopConnection", file: "webshopkoppelingen", about: "Je webshopkoppelingen (zonder de sleutels)." },
  { key: "webshopOrders", model: "WebshopOrder", file: "webshopbestellingen", about: "Alle geïmporteerde webshopbestellingen en retouren, met land en btw." },
  { key: "activity", model: "AuditLog", file: "activiteitenlog", requires: "viewActivity", about: "Het activiteitenlog van je account: wie wat deed en wanneer." },
  { key: "support", model: "SupportMessage", file: "support-berichten", requires: "owner", about: "Je berichten met de support van Saldova." },
];

/** Velden die NOOIT in de export komen, op welk niveau dan ook. */
export const NEVER_EXPORTED_FIELDS: readonly string[] = [
  "passwordHash",
  "totpSecret",
  "totpBackupCodes",
  "inboundToken",
  "publicToken",
  "tokenHash",
  "credentials",
  "dedupeHash",
  "sessionToken",
  "accessToken",
  "refreshToken",
];
const NEVER = new Set(NEVER_EXPORTED_FIELDS);

export interface ExportFile {
  id: string;
  /** Inhoud als data-URL, zoals in de database. */
  dataUrl: string;
  /** Oorspronkelijke bestandsnaam (inbox), als die er is. */
  fileName?: string | null;
  /** Opgegeven type (inbox); anders het type uit de data-URL. */
  mimeType?: string | null;
  /** Naam als er geen oorspronkelijke naam is, bijv. "2026-03-01 Coolblue". */
  label: string;
}

type NumberLike = number | string | { toString(): string };

export interface ExportInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  subtotal: NumberLike;
  vatAmount: NumberLike;
  total: NumberLike;
  notes: string | null;
  customer: {
    name: string;
    address: string | null; // versleuteld
    postalCode: string | null;
    city: string | null;
    country: string | null;
    vatNumber: string | null;
    email: string | null;
  };
  lineItems: { description: string; quantity: NumberLike; unitPrice: NumberLike; vatRate: NumberLike; lineTotal: NumberLike }[];
}

export interface ExportContext {
  ownerEmail: string;
  company: {
    id: string;
    name: string | null;
    kvkNumber: string | null; // versleuteld
    vatNumber: string | null; // versleuteld
    address: string | null; // versleuteld
    postalCode: string | null;
    city: string | null;
    country: string | null;
    logo: string | null;
  } | null;
  settings: { accentColor: string | null; paymentTerms: string | null; footerText: string | null; korEnabled: boolean } | null;
}

/** Waar de export zijn gegevens vandaan haalt. Altijd al beperkt tot één account. */
export interface ExportSource {
  /** Volgende pagina rijen van een tabel, gesorteerd op id, na `after`. */
  rows(table: ExportTableKey, after: string | null, take: number): Promise<ExportRow[]>;
  /** Volgende pagina bestanden van een soort, gesorteerd op id, na `after` (niet voor het logo). */
  files(kind: Exclude<ExportFileKind, "logo">, after: string | null, take: number): Promise<ExportFile[]>;
  /** Volgende pagina facturen die geen concept zijn, met klant en regels. */
  invoices(after: string | null, take: number): Promise<ExportInvoice[]>;
  context(): Promise<ExportContext>;
}

export interface ExportEntry {
  path: string;
  /** Tekst en JSON comprimeren; foto's en PDF's zijn al gecomprimeerd. */
  compress: boolean;
  body: Uint8Array | AsyncIterable<Uint8Array>;
}

export interface ExportOptions {
  /** Wat degene die exporteert mag zien (exportAccessFor(user)). */
  access: ExportAccess;
  now?: Date;
  /** Paginagroottes (de tests zetten ze klein om het bladeren te testen). */
  pageSize?: { rows?: number; files?: number; invoices?: number };
}

const FILE_FOLDER: Record<ExportFileKind, string> = {
  receipt: "bonnetjes",
  inbox: "inbox",
  signature: "offertes/handtekeningen",
  logo: "bedrijf",
};

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/xml": "xml",
  "text/xml": "xml",
};
const ALREADY_COMPRESSED = /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf)$/;

/** Bestandsnaam zonder mappen of tekens die Windows/macOS niet toestaan. */
export function safeFileName(name: string, fallback = "bestand"): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return (cleaned || fallback).slice(0, 120);
}

/** Leest een data-URL. Geeft null bij een ongeldige. */
export function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([\w.+-]+\/[\w.+-]+)?((?:;[\w-]+=[^;,]*)*)(;base64)?,/i.exec(dataUrl);
  if (!match) return null;
  const payload = dataUrl.slice(match[0].length);
  const mime = (match[1] ?? "application/octet-stream").toLowerCase();
  try {
    const bytes = match[3] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    return { mime, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
  } catch {
    return null;
  }
}

/** Houdt per map bij welke namen al gebruikt zijn: "bon.jpg", "bon (2).jpg", ... */
class NameRegistry {
  private used = new Set<string>();
  claim(folder: string, base: string, ext: string): string {
    const lower = (p: string) => p.toLowerCase();
    const suffix = ext ? `.${ext}` : "";
    let path = `${folder}/${base}${suffix}`;
    for (let n = 2; this.used.has(lower(path)); n++) path = `${folder}/${base} (${n})${suffix}`;
    this.used.add(lower(path));
    return path;
  }
}

function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1 || name.length - dot > 8) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot + 1) };
}

/** Pad voor een bestand: oorspronkelijke naam waar die er is, anders het label, met een passende extensie. */
export function exportFilePath(registry: { claim(folder: string, base: string, ext: string): string }, kind: ExportFileKind, file: Pick<ExportFile, "fileName" | "label">, mime: string): string {
  const name = safeFileName(file.fileName ?? "", "") || safeFileName(file.label, kind);
  const { base, ext } = splitName(name);
  return registry.claim(FILE_FOLDER[kind], base, ext || EXTENSION[mime] || "bin");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Haalt geheimen weg, op elk niveau (ook in JSON-velden). */
export function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (NEVER.has(k)) continue;
    out[k] = stripSecrets(v);
  }
  return out;
}

const UNREADABLE = "(kon niet worden ontsleuteld)";

/** Ontsleutelt één veld. Een kapot veld breekt de export niet af, maar wordt gemeld. */
function readable(value: unknown, problems: string[], where: string): unknown {
  if (typeof value !== "string" || value === "") return value ?? null;
  try {
    return decrypt(value);
  } catch {
    problems.push(`${where}: een versleuteld veld kon niet worden ontsleuteld.`);
    return UNREADABLE;
  }
}

/**
 * Een Prisma-Decimal (decimal.js). Herkend op gedrag, niet op de naam van de
 * klasse: in de geminificeerde Prisma-runtime heet die geen "Decimal".
 */
function isDecimalLike(v: unknown): v is { toFixed(): string; toNumber(): number } {
  if (typeof v !== "object" || v === null) return false;
  const d = v as { toFixed?: unknown; toNumber?: unknown };
  return typeof d.toFixed === "function" && typeof d.toNumber === "function";
}

/** Eén CSV-cel: Excel-NL (komma als decimaalteken), tekst beschermd tegen CSV-injectie. */
export function csvValue(v: unknown): string {
  if (v === null || v === undefined) return csvCell("");
  if (v instanceof Date) return csvCell(v.toISOString(), "amount");
  if (typeof v === "number") return csvCell(String(v).replace(".", ","), "amount");
  // toFixed() zonder argument: gewone notatie (nooit 1e-7), met alle decimalen.
  if (isDecimalLike(v)) return csvCell(v.toFixed().replace(".", ","), "amount");
  if (typeof v === "boolean") return csvCell(v ? "ja" : "nee");
  if (typeof v === "object") return csvCell(JSON.stringify(v));
  return csvCell(String(v));
}

const BOM = "﻿";

/** Kopregel van een CSV: met BOM, puntkomma's en CRLF, zoals de andere exports van Saldova. */
export function csvHeader(columns: readonly string[]): string {
  return BOM + columns.map((h) => csvCell(h)).join(";") + "\r\n";
}

/** Eén regel van een CSV, in de volgorde van de kolommen. */
export function csvLine(columns: readonly string[], row: ExportRow): string {
  return columns.map((h) => csvValue(row[h])).join(";") + "\r\n";
}

/** Voegt de kolommen van een rij toe aan de kolomlijst (in volgorde van eerste voorkomen). */
function addColumns(columns: string[], seen: Set<string>, row: ExportRow): void {
  for (const k of Object.keys(row)) if (!seen.has(k)) { seen.add(k); columns.push(k); }
}

/** Een hele CSV in één keer (voor een kleine lijst; de export zelf streamt per pagina). */
export function toCsv(rows: ExportRow[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) addColumns(columns, seen, row);
  return csvHeader(columns) + rows.map((row) => csvLine(columns, row)).join("");
}

const encode = (s: string) => strToU8(s);
const num = (v: NumberLike) => Number(v);

/**
 * Alle bestanden van de export, één voor één. Volgorde: eerst de losse
 * bestanden (zodat de tabellen naar hun pad kunnen verwijzen), dan de tabellen,
 * dan de facturen als PDF en UBL, tot slot LEESMIJ.txt.
 */
export async function* buildAccountExport(source: ExportSource, options: ExportOptions): AsyncGenerator<ExportEntry> {
  const now = options.now ?? new Date();
  const rowsPage = options.pageSize?.rows ?? 500;
  const filesPage = options.pageSize?.files ?? 10;
  const invoicesPage = options.pageSize?.invoices ?? 25;
  const problems: string[] = [];
  const counts = new Map<string, number>();
  const fileIndex = new Map<string, string>();
  const names = new NameRegistry();
  const ctx = await source.context();

  const fileEntry = (kind: ExportFileKind, file: ExportFile): ExportEntry | null => {
    const parsed = parseDataUrl(file.dataUrl);
    if (!parsed) {
      problems.push(`${FILE_FOLDER[kind]}: een bestand kon niet worden gelezen (${file.fileName ?? file.label}).`);
      return null;
    }
    const mime = (file.mimeType || parsed.mime).toLowerCase();
    const path = exportFilePath(names, kind, file, mime);
    fileIndex.set(`${kind}:${file.id}`, path);
    counts.set(`files:${kind}`, (counts.get(`files:${kind}`) ?? 0) + 1);
    return { path, compress: !ALREADY_COMPRESSED.test(mime), body: parsed.bytes };
  };

  // 1. Losse bestanden: logo, bonnetjes, inbox-bijlagen, handtekeningen.
  if (ctx.company?.logo) {
    const entry = fileEntry("logo", { id: ctx.company.id, dataUrl: ctx.company.logo, label: "logo" });
    if (entry) yield entry;
  }
  for (const kind of ["receipt", "inbox", "signature"] as const) {
    let after: string | null = null;
    for (;;) {
      const page = await source.files(kind, after, filesPage);
      for (const file of page) {
        const entry = fileEntry(kind, file);
        if (entry) yield entry;
      }
      if (page.length < filesPage) break;
      after = page[page.length - 1].id;
    }
  }

  // 2. De tabellen: JSON en daarna CSV, allebei per pagina gestreamd. Zo staat
  //    nooit een hele tabel in het geheugen; de CSV leest de tabel daarvoor
  //    een tweede keer in delen. De kolommen van de CSV komen uit de JSON-ronde.
  const access = options.access;
  for (const spec of tablesFor(access)) {
    const hidden = access.financials ? [] : (spec.financialFields ?? []);
    const columns: string[] = [];
    const seenColumns = new Set<string>();
    let count = 0;
    const clean = (raw: ExportRow): ExportRow => {
      const row = stripSecrets(raw) as ExportRow;
      for (const field of hidden) delete row[field];
      for (const field of spec.encrypted ?? []) {
        if (field in row) row[field] = readable(row[field], problems, `gegevens/${spec.file}`);
      }
      if (spec.fileRef) {
        delete row[spec.fileRef.field];
        row[spec.fileRef.pathField] = fileIndex.get(`${spec.fileRef.kind}:${String(row.id)}`) ?? null;
      }
      return row;
    };
    /** De tabel in pagina's, al opgeschoond. */
    async function* pages(): AsyncGenerator<ExportRow[]> {
      let after: string | null = null;
      for (;;) {
        const page = await source.rows(spec.key, after, rowsPage);
        if (page.length) yield page.map(clean);
        if (page.length < rowsPage) break;
        after = String(page[page.length - 1].id);
      }
    }
    async function* json(): AsyncGenerator<Uint8Array> {
      yield encode("[");
      for await (const rows of pages()) {
        const text = rows.map((r) => "\n  " + JSON.stringify(r)).join(",");
        yield encode((count > 0 ? "," : "") + text);
        count += rows.length;
        for (const row of rows) addColumns(columns, seenColumns, row);
      }
      yield encode(count ? "\n]\n" : "]\n");
      counts.set(`table:${spec.key}`, count);
    }
    async function* csv(): AsyncGenerator<Uint8Array> {
      yield encode(csvHeader(columns));
      if (count === 0) return;
      for await (const rows of pages()) yield encode(rows.map((r) => csvLine(columns, r)).join(""));
    }
    yield { path: `gegevens/${spec.file}.json`, compress: true, body: json() };
    // De ZIP leest de JSON helemaal uit voordat hij hier verdergaat: `columns` is dan compleet.
    if (spec.csv !== false) yield { path: `gegevens/${spec.file}.csv`, compress: true, body: csv() };
  }

  // 3. Facturen als PDF en als e-factuur (UBL), behalve concepten.
  const company = ctx.company;
  const companyName = company?.name || ctx.ownerEmail;
  const sender = {
    address: readable(company?.address, problems, "bedrijf") as string | null,
    vatNumber: readable(company?.vatNumber, problems, "bedrijf") as string | null,
    kvkNumber: readable(company?.kvkNumber, problems, "bedrijf") as string | null,
  };
  const iban = extractIban(ctx.settings?.paymentTerms);
  let invoiceCount = 0;
  let after: string | null = null;
  for (;;) {
    const page = await source.invoices(after, invoicesPage);
    for (const inv of page) {
      if (inv.status === "DRAFT") continue;
      const base = safeFileName(inv.invoiceNumber, inv.id);
      const customerAddress = readable(inv.customer.address, problems, `factuur ${inv.invoiceNumber}`) as string | null;
      const lineItems = inv.lineItems.map((li) => ({
        description: li.description,
        quantity: num(li.quantity),
        unitPrice: num(li.unitPrice),
        vatRate: num(li.vatRate),
        lineTotal: num(li.lineTotal),
      }));
      const totals = { subtotal: num(inv.subtotal), vatAmount: num(inv.vatAmount), total: num(inv.total) };
      try {
        const paymentQr = iban && inv.status !== "PAID" && inv.status !== "CANCELED"
          ? epcQrPayload({ name: companyName, iban, amount: totals.total, currency: inv.currency, reference: `Factuur ${inv.invoiceNumber}` })
          : null;
        const pdf = await generateInvoicePdf({
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          currency: inv.currency,
          company: { name: companyName, address: sender.address, postalCode: company?.postalCode ?? null, city: company?.city ?? null, vatNumber: sender.vatNumber, kvkNumber: sender.kvkNumber },
          customer: { name: inv.customer.name, address: customerAddress, postalCode: inv.customer.postalCode, city: inv.customer.city },
          lineItems,
          ...totals,
          notes: inv.notes,
          logo: company?.logo,
          accentColor: ctx.settings?.accentColor,
          paymentTerms: ctx.settings?.paymentTerms,
          footerText: ctx.settings?.footerText,
          paymentQr,
        });
        yield { path: names.claim("facturen/pdf", base, "pdf"), compress: false, body: pdf };
        invoiceCount++;
      } catch {
        problems.push(`facturen/pdf: van factuur ${inv.invoiceNumber} kon geen PDF worden gemaakt. De gegevens staan wel in gegevens/facturen.`);
      }
      try {
        const xml = generateUblInvoice({
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          currency: inv.currency,
          supplier: { name: companyName, address: sender.address, postalCode: company?.postalCode, city: company?.city, country: company?.country, vatNumber: sender.vatNumber, kvkNumber: sender.kvkNumber, email: ctx.ownerEmail },
          customer: { name: inv.customer.name, address: customerAddress, postalCode: inv.customer.postalCode, city: inv.customer.city, country: inv.customer.country, vatNumber: inv.customer.vatNumber, email: inv.customer.email },
          lineItems,
          ...totals,
          notes: inv.notes,
          iban,
          kor: ctx.settings?.korEnabled ?? false,
        });
        yield { path: names.claim("facturen/ubl", base, "xml"), compress: true, body: encode(xml) };
      } catch {
        problems.push(`facturen/ubl: van factuur ${inv.invoiceNumber} kon geen e-factuur worden gemaakt. De gegevens staan wel in gegevens/facturen.`);
      }
    }
    if (page.length < invoicesPage) break;
    after = page[page.length - 1].id;
  }
  counts.set("files:invoicePdf", invoiceCount);

  // 4. LEESMIJ.txt
  yield { path: "LEESMIJ.txt", compress: true, body: encode(readme({ ctx, now, counts, problems, access })) };
}

function readme({ ctx, now, counts, problems, access }: { ctx: ExportContext; now: Date; counts: Map<string, number>; problems: string[]; access: ExportAccess }): string {
  const n = (key: string) => counts.get(key) ?? 0;
  const tables = tablesFor(access);
  const skipped = EXPORT_TABLES.filter((t) => !tables.includes(t));
  const hiddenFinancials = access.financials ? [] : tables.filter((t) => t.financialFields?.length);
  const lines = [
    "SALDOVA - VOLLEDIGE EXPORT VAN JE ADMINISTRATIE",
    "",
    `Gemaakt op: ${now.toISOString().slice(0, 16).replace("T", " ")} (UTC)`,
    `Account: ${ctx.company?.name || ctx.ownerEmail}`,
    "",
    "BEWAAR DIT BESTAND 7 JAAR",
    "Als ondernemer moet je je administratie 7 jaar bewaren (artikel 52 van de",
    "Algemene wet inzake rijksheffingen). Deze ZIP is je administratie zoals die op",
    "het moment van exporteren in Saldova stond. Bewaar hem op een veilige plek, het",
    "liefst op twee plekken. Na het verwijderen van je account kunnen wij niets meer",
    "terughalen.",
    "",
    "WAT STAAT WAAR",
    "",
    "gegevens/",
    "  Per onderdeel een JSON-bestand (alle velden, voor andere software) en meestal",
    "  ook een CSV-bestand (te openen in Excel: puntkomma als scheidingsteken, komma",
    "  als decimaalteken). Datums staan in UTC. Ja/nee-velden staan in de CSV als",
    "  'ja' of 'nee'. Rijen verwijzen naar elkaar met hun id (bijvoorbeeld",
    "  customerId in facturen hoort bij id in klanten).",
    "",
    ...tables.flatMap((t) => [`  ${t.file}.json${t.csv === false ? "" : ` en ${t.file}.csv`} (${n(`table:${t.key}`)})`, `    ${t.about}`]),
    "",
    `facturen/pdf/  (${n("files:invoicePdf")})`,
    "  Elke factuur die geen concept is, als PDF, opnieuw opgemaakt met je huidige",
    "  bedrijfsgegevens, logo en factuurinstellingen.",
    "",
    "facturen/ubl/",
    "  Dezelfde facturen als e-factuur (UBL 2.1 / Peppol BIS 3). Die kun je in een",
    "  boekhoudpakket inlezen.",
    "",
    `bonnetjes/  (${n("files:receipt")})`,
    "  De bonnetjes bij je uitgaven, als foto of PDF. In gegevens/uitgaven staat in de",
    "  kolom bonnetjeBestand welk bestand bij welke uitgave hoort.",
    "",
    `inbox/  (${n("files:inbox")})`,
    "  Bijlagen uit je bonnetjes-inbox, met hun oorspronkelijke naam en type. Bestaat",
    "  een naam al, dan staat er (2), (3) enzovoort achter. In gegevens/inbox staat in",
    "  de kolom bestand welk bestand bij welk bericht hoort.",
    "",
    `offertes/handtekeningen/  (${n("files:signature")})`,
    "  De handtekeningen bij ondertekende offertes. Zie de kolom handtekeningBestand",
    "  in gegevens/offertes.",
    "",
    "bedrijf/",
    "  Je logo, als je er een hebt ingesteld.",
    "",
    "WAT ER NIET IN STAAT",
    "- Wachtwoorden, 2FA-geheimen en back-upcodes, inlogsessies en tokens. Die zijn",
    "  alleen om in te loggen en horen niet in een archief.",
    "- De sleutels van je webshopkoppelingen.",
    "- Concept-facturen staan wel in gegevens/facturen, maar niet als PDF of",
    "  e-factuur: een concept is nog geen factuur.",
    "- Een auditfile (XAF) en de boekhouder-export (CSV) per jaar zitten er niet in.",
    "  Die download je apart in Saldova bij Btw. Ze zijn een handige aanvulling voor",
    "  je boekhouder, maar deze ZIP bevat de gegevens waar ze uit worden gemaakt.",
    ...skipped.map((t) => `- gegevens/${t.file}: ${GATE_REASON[t.requires!]}.`),
    ...(hiddenFinancials.length
      ? [`- Het bruto uurloon in gegevens/${hiddenFinancials.map((t) => t.file).join(", ")}: dat ziet alleen wie facturatie mag inzien.`]
      : []),
  ];
  if (problems.length) {
    lines.push("", "LET OP: NIET ALLES KON WORDEN GEEXPORTEERD");
    for (const p of [...new Set(problems)]) lines.push(`- ${p}`);
    lines.push("Neem contact op met Saldova als je hierbij hulp nodig hebt.");
  }
  return lines.join("\r\n") + "\r\n";
}

/**
 * Pakt de bestanden in als ZIP, stukje voor stukje. Elke stap levert minstens
 * één stuk op (lege stukken worden overgeslagen), zodat de ReadableStream van
 * de route nooit blijft hangen.
 */
export async function* zipEntries(entries: AsyncIterable<ExportEntry>, mtime: Date = new Date()): AsyncGenerator<Uint8Array> {
  const out: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else if (chunk.length) out.push(chunk);
  });
  function* drain(): Generator<Uint8Array> {
    if (failure) throw failure;
    while (out.length) yield out.shift()!;
  }
  for await (const entry of entries) {
    const file = entry.compress ? new ZipDeflate(entry.path, { level: 6 }) : new ZipPassThrough(entry.path);
    file.mtime = mtime;
    zip.add(file);
    if (entry.body instanceof Uint8Array) {
      file.push(entry.body, true);
    } else {
      for await (const chunk of entry.body) {
        file.push(chunk);
        yield* drain();
      }
      file.push(new Uint8Array(0), true);
    }
    yield* drain();
  }
  zip.end();
  yield* drain();
}
