import type { Prisma } from "@prisma/client";
import { decrypt as defaultDecrypt } from "@/lib/encryption";
import { normalizeVatId, parseVatScheme, vatSchemeProblem, type VatScheme } from "@/lib/vat-scheme";
import { korIssueThresholdProblem, korLinesProblem } from "@/lib/kor";

/**
 * Momentopname van een factuur bij het uitreiken (art. 52 AWR: een
 * ongewijzigde kopie bewaren). Bij concept -> verzonden of betaald leggen we
 * vast wat er op dat moment op de factuur stond: verkoper- en klantgegevens,
 * btw-nummers, KvK, KOR-stand, btw-soort, betaalgegevens en voettekst.
 * PDF en UBL komen daarna altijd uit deze momentopname, ook als de klant
 * verhuist of het IBAN later verandert.
 *
 * - Concepten en oude facturen (van voor deze kolom) hebben geen momentopname:
 *   daar gelden de huidige gegevens, zoals voorheen.
 * - Gevoelige velden (adres, btw- en KvK-nummer van het bedrijf, adres van de
 *   klant) blijven versleuteld, precies zoals ze in de database staan.
 * - Logo en huisstijlkleur zijn opmaak en geen factuurgegeven: die blijven de
 *   huidige (een logo kan groot zijn).
 * - De taal van de factuur (locale) ligt ook vast, zodat de wettelijke
 *   vermelding en de labels niet veranderen als de eigenaar later van taal
 *   wisselt. Ontbreekt die (eerdere momentopname): de huidige taal.
 * - Een creditfactuur krijgt de verkoper- en klantgegevens (en de KOR-stand)
 *   van het origineel, als dat een momentopname heeft: hij draait precies die
 *   factuur terug.
 */
export const SNAPSHOT_VERSION = 1;

export interface InvoiceSnapshot {
  version: 1;
  /** Moment van vastleggen (ISO). */
  takenAt: string;
  seller: {
    name: string;
    email: string | null;
    /** Versleuteld, zoals in Company. */
    address: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    /** Versleuteld, zoals in Company. */
    vatNumber: string | null;
    /** Versleuteld, zoals in Company. */
    kvkNumber: string | null;
  };
  customer: {
    name: string;
    email: string | null;
    /** Versleuteld, zoals in Customer. */
    address: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    vatNumber: string | null;
    /** Peppol-adres ("schema:nummer"). Optioneel: eerdere momentopnames hebben het niet. */
    electronicAddress?: string | null;
  };
  korEnabled: boolean;
  vatScheme: VatScheme;
  paymentTerms: string | null;
  footerText: string | null;
  /** Taal van de factuur ("nl" of "en"). Optioneel: eerdere momentopnames hebben hem niet. */
  locale?: string | null;
}

/** De huidige gegevens, zoals ze uit de database komen (gevoelige velden versleuteld). */
export interface SnapshotSource {
  userEmail: string;
  company: {
    name?: string | null; address?: string | null; postalCode?: string | null; city?: string | null;
    country?: string | null; vatNumber?: string | null; kvkNumber?: string | null;
  } | null | undefined;
  customer: {
    name: string; email?: string | null; address?: string | null; postalCode?: string | null;
    city?: string | null; country?: string | null; vatNumber?: string | null;
    electronicAddress?: string | null;
  };
  settings: { korEnabled?: boolean | null; paymentTerms?: string | null; footerText?: string | null } | null | undefined;
  vatScheme: string | null | undefined;
  /** Taal van het account op dit moment. */
  locale?: string | null;
}

const orNull = (value: string | null | undefined) => (value === undefined || value === null || value === "" ? null : value);

export function buildInvoiceSnapshot(source: SnapshotSource, now: Date = new Date()): InvoiceSnapshot {
  const c = source.company;
  return {
    version: SNAPSHOT_VERSION,
    takenAt: now.toISOString(),
    seller: {
      name: c?.name?.trim() ? c.name : source.userEmail,
      email: orNull(source.userEmail),
      address: orNull(c?.address), postalCode: orNull(c?.postalCode), city: orNull(c?.city),
      country: orNull(c?.country), vatNumber: orNull(c?.vatNumber), kvkNumber: orNull(c?.kvkNumber),
    },
    customer: {
      name: source.customer.name,
      email: orNull(source.customer.email),
      address: orNull(source.customer.address), postalCode: orNull(source.customer.postalCode),
      city: orNull(source.customer.city), country: orNull(source.customer.country),
      // Zonder spaties, punten of streepjes (geldig in UBL/Peppol en op de PDF).
      vatNumber: orNull(normalizeVatId(source.customer.vatNumber)),
      electronicAddress: orNull(source.customer.electronicAddress),
    },
    korEnabled: !!source.settings?.korEnabled,
    vatScheme: parseVatScheme(source.vatScheme),
    paymentTerms: orNull(source.settings?.paymentTerms),
    footerText: orNull(source.settings?.footerText),
    locale: orNull(source.locale),
  };
}

/**
 * Momentopname van een creditfactuur: de partijen en de KOR-stand van het
 * origineel (als dat een momentopname heeft), de rest van nu.
 */
export function creditIssueSnapshot(current: InvoiceSnapshot, original: InvoiceSnapshot | null): InvoiceSnapshot {
  if (!original) return current;
  return { ...current, seller: { ...original.seller }, customer: { ...original.customer }, korEnabled: original.korEnabled };
}

const str = (v: unknown) => v === null || typeof v === "string";

/** Een geldige momentopname uit de JSON-kolom, of null (oud, leeg of beschadigd). */
export function parseInvoiceSnapshot(value: unknown): InvoiceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  if (s.version !== SNAPSHOT_VERSION) return null;
  const seller = s.seller as Record<string, unknown> | undefined;
  const customer = s.customer as Record<string, unknown> | undefined;
  if (!seller || typeof seller !== "object" || typeof seller.name !== "string") return null;
  if (!customer || typeof customer !== "object" || typeof customer.name !== "string") return null;
  const sellerKeys = ["email", "address", "postalCode", "city", "country", "vatNumber", "kvkNumber"];
  const customerKeys = ["email", "address", "postalCode", "city", "country", "vatNumber", "electronicAddress"];
  if (!sellerKeys.every((k) => str(seller[k] ?? null)) || !customerKeys.every((k) => str(customer[k] ?? null))) return null;
  if (typeof s.korEnabled !== "boolean" || !str(s.paymentTerms ?? null) || !str(s.footerText ?? null) || !str(s.locale ?? null)) return null;
  return value as InvoiceSnapshot;
}

/**
 * Betaalgegevens voor een herinnering of e-mail bij een bestaande factuur: uit
 * de momentopname als die er is (zelfde IBAN als op de PDF, UBL en QR), anders
 * de huidige (oude facturen van voor de momentopname).
 */
export function reminderPaymentTerms(snapshot: unknown, current: string | null | undefined): string | null {
  const snap = parseInvoiceSnapshot(snapshot);
  return snap ? snap.paymentTerms : current ?? null;
}

/** Leesbare gegevens voor PDF, UBL en e-mail. */
export interface InvoiceParties {
  /** true = uit de momentopname (vastgezet), false = huidige gegevens. */
  frozen: boolean;
  seller: {
    name: string; email: string | null; address: string | null; postalCode: string | null; city: string | null;
    country: string | null; vatNumber: string | null; kvkNumber: string | null;
  };
  customer: {
    name: string; email: string | null; address: string | null; postalCode: string | null; city: string | null;
    country: string | null; vatNumber: string | null;
    /** Peppol-adres ("schema:nummer") of null. */
    electronicAddress: string | null;
  };
  korEnabled: boolean;
  vatScheme: VatScheme;
  paymentTerms: string | null;
  footerText: string | null;
  /** Taal voor labels en wettelijke vermelding (vastgezet, of de huidige). */
  locale: string | null;
}

/**
 * Gegevens voor één factuur: uit de momentopname als die er is, anders de
 * huidige (concepten en oude facturen, zoals voorheen). De btw-soort komt uit
 * de factuur zelf (ligt vast sinds het aanmaken).
 */
export function invoiceParties(
  invoice: { snapshot?: unknown; vatScheme?: string | null },
  live: SnapshotSource,
  decrypt: (value: string | null | undefined) => string | null = defaultDecrypt,
): InvoiceParties {
  const snap = parseInvoiceSnapshot(invoice.snapshot);
  const source = snap ?? buildInvoiceSnapshot(live);
  return {
    frozen: !!snap,
    seller: {
      ...source.seller,
      address: decrypt(source.seller.address),
      vatNumber: decrypt(source.seller.vatNumber),
      kvkNumber: decrypt(source.seller.kvkNumber),
    },
    customer: {
      ...source.customer,
      address: decrypt(source.customer.address),
      // Routeringsgegeven, geen factuurgegeven: ontbreekt het in de momentopname
      // (eerdere momentopname of later ingevuld), dan het huidige Peppol-adres.
      electronicAddress: source.customer.electronicAddress ?? orNull(live.customer.electronicAddress),
    },
    korEnabled: source.korEnabled,
    vatScheme: parseVatScheme(invoice.vatScheme ?? (snap ? snap.vatScheme : null)),
    paymentTerms: source.paymentTerms,
    footerText: source.footerText,
    locale: source.locale ?? orNull(live.locale),
  };
}

/** Wat een route uit de database ophaalt om invoiceParties te kunnen maken. */
export const partiesInclude = {
  customer: true,
  user: {
    select: {
      email: true,
      locale: true,
      company: true,
      invoiceSettings: { select: { korEnabled: true, paymentTerms: true, footerText: true, accentColor: true } },
    },
  },
} as const satisfies Prisma.InvoiceInclude;

type InvoiceWithParties = Prisma.InvoiceGetPayload<{ include: typeof partiesInclude }>;

/** Huidige gegevens van een factuur die met partiesInclude is opgehaald. */
export function liveSource(invoice: InvoiceWithParties): SnapshotSource {
  return {
    userEmail: invoice.user.email,
    company: invoice.user.company,
    customer: invoice.customer,
    settings: invoice.user.invoiceSettings,
    vatScheme: invoice.vatScheme,
    locale: invoice.user.locale,
  };
}

type SnapshotClient = Pick<Prisma.TransactionClient, "invoice">;

export interface IssuePreparation {
  /** De momentopname om mee op te slaan, of undefined als de factuur er al een heeft. */
  snapshot: Prisma.InputJsonValue | undefined;
  /** Waarom deze factuur zo niet uitgereikt kan worden, of null. */
  problem: string | null;
}

/** Kan deze factuur met deze gegevens worden uitgereikt? (btw-soort en KOR) */
export function issueProblem(snapshot: InvoiceSnapshot, lineRates: number[], isCredit: boolean): string | null {
  return korLinesProblem(snapshot.korEnabled && snapshot.vatScheme === "STANDARD", lineRates, isCredit)
    ?? vatSchemeProblem({
      scheme: snapshot.vatScheme, lineRates, isCredit, korEnabled: snapshot.korEnabled,
      customer: snapshot.customer, seller: snapshot.seller,
    });
}

/**
 * De momentopname bij het uitreiken van deze factuur: de gegevens van nu, en
 * bij een creditfactuur de partijen van het origineel.
 */
export async function issueSnapshotFor(
  client: SnapshotClient,
  accountId: string,
  invoice: { originalInvoiceId?: string | null },
  live: SnapshotSource,
  now: Date = new Date(),
): Promise<InvoiceSnapshot> {
  const current = buildInvoiceSnapshot(live, now);
  if (!invoice.originalInvoiceId) return current;
  const original = await client.invoice.findFirst({
    where: { id: invoice.originalInvoiceId, userId: accountId }, select: { snapshot: true },
  });
  return creditIssueSnapshot(current, parseInvoiceSnapshot(original?.snapshot));
}

/**
 * Alle controles bij het uitreiken: btw-soort, KOR-regels en de harde
 * KOR-grens (uitgereikte facturen van dat jaar plus deze).
 */
export async function issueProblemFor(
  client: SnapshotClient,
  accountId: string,
  snapshot: InvoiceSnapshot,
  invoice: { lineRates: number[]; isCredit: boolean; subtotal: number; issueDate: Date },
): Promise<string | null> {
  return issueProblem(snapshot, invoice.lineRates, invoice.isCredit)
    ?? await korIssueThresholdProblem(client, accountId, {
      korEnabled: snapshot.korEnabled, vatScheme: snapshot.vatScheme, isCredit: invoice.isCredit,
      subtotal: invoice.subtotal, issueDate: invoice.issueDate,
    });
}

/**
 * Voorbereiding op het uitreiken (concept naar verzonden of betaald): de
 * momentopname van nu, en of de factuur zo mag. Heeft de factuur al een
 * momentopname, dan blijft die staan (een uitgereikte factuur verandert nooit
 * meer) en is er niets te controleren. Geef de momentopname mee in dezelfde
 * update die de status wijzigt.
 */
export async function prepareIssue(client: SnapshotClient, accountId: string, invoiceId: string, now: Date = new Date()): Promise<IssuePreparation> {
  const invoice = await client.invoice.findFirst({
    where: { id: invoiceId, userId: accountId },
    include: { ...partiesInclude, lineItems: { select: { vatRate: true } } },
  });
  if (!invoice || parseInvoiceSnapshot(invoice.snapshot)) return { snapshot: undefined, problem: null };
  const snapshot = await issueSnapshotFor(client, accountId, invoice, liveSource(invoice), now);
  const problem = await issueProblemFor(client, accountId, snapshot, {
    lineRates: invoice.lineItems.map((li) => Number(li.vatRate)),
    isCredit: !!invoice.originalInvoiceId || Number(invoice.total) < 0,
    subtotal: Number(invoice.subtotal),
    issueDate: invoice.issueDate,
  });
  return { snapshot: snapshot as unknown as Prisma.InputJsonValue, problem };
}
