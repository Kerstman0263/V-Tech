/**
 * Boekhouder-exports die rechtstreeks in boekhoudsoftware te laden zijn.
 *
 * Saldova is facturatie-gedreven (geen eigen grootboek). Voor de export
 * leiden we journaalposten af uit facturen en uitgaven met een vast, compact
 * rekeningschema (RGS-achtig, herkenbaar voor elke NL-boekhouder):
 *
 *   1100 Bank                     8000 Omzet
 *   1300 Debiteuren               4000–4900 Kosten per categorie
 *   1600 Crediteuren              1500 Btw af te dragen (hoog/laag)
 *   1520 Btw voorbelasting        0999 Tegenrekening beginbalans
 *
 * Twee formaten:
 *  - XML Auditfile Financieel 3.2 (.xaf) — de Nederlandse standaard; bedoeld
 *    voor import in pakketten als Exact, SnelStart, e-Boekhouden en Twinfield.
 *    De volgorde van de elementen volgt de openbare elementlijst van XAF 3.2.
 *    Er is (nog) niet tegen het officiële XSD gevalideerd.
 *    De beginbalans bevat alleen Debiteuren (1300): de facturen uit eerdere
 *    jaren die op 1 januari nog openstonden, tegen 0999. Zo klopt het saldo
 *    van 1300 als er in dit jaar een ontvangst van zo'n factuur is geboekt.
 *  - Journaalposten-CSV — één regel per boekingsregel (datum, dagboek, rekening,
 *    debet, credit, btw-code), voor "boekingen importeren" in elk pakket.
 *
 * Welke facturen tellen mee (zelfde regel als de btw-pagina en de rapporten):
 *  - alleen uitgereikte facturen: verzonden, te laat en betaald (ook
 *    creditfacturen). Concepten en vervallen concepten (CANCELED) zijn nooit
 *    uitgereikt en krijgen geen boeking;
 *  - alleen facturen in euro's. Een factuur in een andere valuta heeft geen
 *    vastgelegde koers; die laten we weg en melden we apart (auditfileNotes).
 *
 * Alles hier is puur (geen database) en getest.
 */
import { vatBreakdown } from "@/lib/vat-breakdown";
import { fromCents, toCents } from "@/lib/money";
import { csvAmount, toCsv } from "@/lib/csv-safe";

export interface LedgerAccount {
  id: string;
  name: string;
  type: "B" | "P"; // balans / winst & verlies
}

export const LEDGER: LedgerAccount[] = [
  { id: "0999", name: "Tegenrekening beginbalans", type: "B" },
  { id: "1100", name: "Bank", type: "B" },
  { id: "1300", name: "Debiteuren", type: "B" },
  { id: "1500", name: "Btw af te dragen", type: "B" },
  { id: "1520", name: "Btw voorbelasting", type: "B" },
  { id: "1600", name: "Crediteuren", type: "B" },
  { id: "4000", name: "Kantoor & benodigdheden", type: "P" },
  { id: "4100", name: "Reis & verblijf", type: "P" },
  { id: "4200", name: "Apparatuur & gereedschap", type: "P" },
  { id: "4300", name: "Software & abonnementen", type: "P" },
  { id: "4400", name: "Telefoon & internet", type: "P" },
  { id: "4500", name: "Marketing & website", type: "P" },
  { id: "4600", name: "Opleiding & vakliteratuur", type: "P" },
  { id: "4700", name: "Verzekeringen & advies", type: "P" },
  { id: "4900", name: "Overige kosten", type: "P" },
  { id: "8000", name: "Omzet", type: "P" },
];

export const EXPENSE_ACCOUNT: Record<string, string> = {
  OFFICE: "4000",
  TRAVEL: "4100",
  EQUIPMENT: "4200",
  SOFTWARE: "4300",
  PHONE_INTERNET: "4400",
  MARKETING: "4500",
  EDUCATION: "4600",
  INSURANCE: "4700",
  OTHER: "4900",
};

/** Uitgereikte facturen: alleen die komen in de exports (zie lib/reports.ts). */
export const EXPORTED_INVOICE_STATUSES = ["SENT", "OVERDUE", "PAID"] as const;

export function isExportedInvoiceStatus(status: string): boolean {
  return (EXPORTED_INVOICE_STATUSES as readonly string[]).includes(status);
}

/** Factuur in euro's? Leeg telt als euro (zo werken oude facturen). */
export function isEuro(currency: string | null | undefined): boolean {
  return !currency || currency.trim().toUpperCase() === "EUR";
}

export interface JournalLine {
  account: string;
  description: string;
  debit: number;
  credit: number;
  /** Btw-code (zie VAT_CODES), alleen op omzet- en kostenregels. */
  vatCode?: string;
  /** Btw-tarief in procenten bij vatCode. */
  vatPerc?: number;
  /** Btw-bedrag dat bij deze regel hoort (altijd positief). */
  vatAmount?: number;
  /** Debet of credit voor het btw-bedrag. */
  vatAmountType?: "D" | "C";
  customerId?: string;
}

export interface JournalEntry {
  journal: "VRK" | "INK" | "BNK"; // verkoop / inkoop / bank
  date: Date;
  reference: string;
  description: string;
  lines: JournalLine[];
}

export interface XafInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  status: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  customerId: string;
  customerName: string;
  /** Betaaldatum (zie paidDateForExport). Alleen gebruikt bij status PAID. */
  paidAt?: Date | null;
  /** Valuta van de factuur; leeg = EUR. */
  currency?: string | null;
  /** Btw-soort (lib/vat-scheme.ts); leeg = gewone btw. */
  vatScheme?: string | null;
  /** Factuurregels: voor een omzetregel per btw-tarief. Leeg = één regel (oud gedrag). */
  lines?: { lineTotal: number; vatRate: number }[];
}

export interface XafExpense {
  id: string;
  date: Date;
  vendor: string;
  description?: string | null;
  category: string;
  amountGross: number;
  vatRate: number;
  vatAmount: number;
}

/** Btw-codes in de export. Alleen een omschrijving; de boekhouder koppelt ze aan zijn rubrieken. */
export const VAT_CODES: { id: string; desc: string; perc: number; payable: boolean }[] = [
  { id: "H", desc: "Btw hoog 21%", perc: 21, payable: true },
  { id: "L", desc: "Btw laag 9%", perc: 9, payable: true },
  { id: "N", desc: "Geen btw / vrijgesteld (0%)", perc: 0, payable: false },
  { id: "V", desc: "Btw verlegd binnen Nederland", perc: 0, payable: false },
  { id: "E", desc: "Dienst aan EU-bedrijf, btw verlegd", perc: 0, payable: false },
  { id: "I", desc: "Intracommunautaire levering (0%)", perc: 0, payable: false },
];

export function vatCode(rate: number): string {
  if (rate >= 20) return "H";
  if (rate > 0) return "L";
  return "N";
}

/** Btw-code van een omzetregel: bij 0% telt de btw-soort van de factuur. */
export function salesVatCode(rate: number, vatScheme?: string | null): string {
  if (rate !== 0) return vatCode(rate);
  if (vatScheme === "REVERSE_NL") return "V";
  if (vatScheme === "REVERSE_EU") return "E";
  if (vatScheme === "ICL") return "I";
  return "N";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Bedrag op de normale kant (D of C); negatief = andere kant. */
function post(amount: number, side: "D" | "C"): { debit: number; credit: number } {
  const value = r2(Math.abs(amount));
  const onSide = amount >= 0 ? side : side === "D" ? "C" : "D";
  return onSide === "D" ? { debit: value, credit: 0 } : { debit: 0, credit: value };
}

const sideOf = (amount: number, side: "D" | "C"): "D" | "C" => (amount >= 0 ? side : side === "D" ? "C" : "D");

interface RevenueGroup { rate: number; base: number; vat: number }

/**
 * Omzet per btw-tarief. Met factuurregels: grondslag en btw per tarief (zelfde
 * rekenwijze als PDF en UBL). Kloppen die niet met de opgeslagen totalen (of
 * zijn er geen regels), dan één groep met de opgeslagen bedragen en het tarief
 * dat het dichtst bij btw/netto ligt (het oude gedrag).
 */
export function revenueGroups(inv: Pick<XafInvoice, "subtotal" | "vatAmount" | "lines">): RevenueGroup[] {
  const netCents = toCents(inv.subtotal);
  const vatCents = toCents(inv.vatAmount);
  if (inv.lines && inv.lines.length > 0) {
    const groups = vatBreakdown(inv.lines);
    const baseSum = groups.reduce((s, g) => s + toCents(g.base), 0);
    const vatSum = groups.reduce((s, g) => s + toCents(g.vat), 0);
    if (baseSum === netCents && vatSum === vatCents) {
      return groups.filter((g) => g.base !== 0 || g.vat !== 0);
    }
  }
  const ratio = netCents !== 0 ? (Math.abs(vatCents) / Math.abs(netCents)) * 100 : 0;
  const code = vatCode(ratio);
  const rate = code === "H" ? 21 : code === "L" ? 9 : 0;
  return [{ rate, base: fromCents(netCents), vat: fromCents(vatCents) }];
}

/**
 * Journaalposten van één jaar:
 *  - verkoopboeking op de factuurdatum, voor uitgereikte facturen in euro's;
 *  - ontvangst op de betaaldatum, ook als de factuur uit een eerder jaar is
 *    (een decemberfactuur die in januari betaald wordt);
 *  - inkoopboeking per uitgave.
 */
export function buildJournal(invoices: XafInvoice[], expenses: XafExpense[], year: number): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const inYear = (d: Date) => d.getUTCFullYear() === year;

  for (const inv of invoices) {
    if (!isExportedInvoiceStatus(inv.status) || !isEuro(inv.currency)) continue;
    const groups = revenueGroups(inv);
    const grossCents = groups.reduce((s, g) => s + toCents(g.base) + toCents(g.vat), 0);
    const gross = fromCents(grossCents);
    // Een factuur van 0 euro geeft geen boeking.
    if (groups.every((g) => g.base === 0 && g.vat === 0)) continue;

    if (inYear(inv.issueDate)) {
      const lines: JournalLine[] = [
        { account: "1300", description: `${inv.customerName} — ${inv.invoiceNumber}`, ...post(gross, "D"), customerId: inv.customerId },
      ];
      for (const g of groups) {
        lines.push({
          account: "8000",
          description: groups.length > 1 ? `Omzet ${g.rate}% ${inv.invoiceNumber}` : `Omzet ${inv.invoiceNumber}`,
          ...post(g.base, "C"),
          vatCode: salesVatCode(g.rate, inv.vatScheme),
          vatPerc: g.rate,
          vatAmount: r2(Math.abs(g.vat)),
          vatAmountType: sideOf(g.vat, "C"),
        });
      }
      for (const g of groups) {
        if (g.vat === 0) continue;
        lines.push({ account: "1500", description: groups.length > 1 ? `Btw ${g.rate}% ${inv.invoiceNumber}` : `Btw ${inv.invoiceNumber}`, ...post(g.vat, "C") });
      }
      entries.push({ journal: "VRK", date: inv.issueDate, reference: inv.invoiceNumber, description: `Factuur ${inv.invoiceNumber} ${inv.customerName}`, lines });
    }

    // Ontvangst: bank tegen debiteuren, op de betaaldatum (los van het factuurjaar).
    if (inv.status === "PAID" && inv.paidAt && inYear(inv.paidAt) && grossCents !== 0) {
      entries.push({
        journal: "BNK",
        date: inv.paidAt,
        reference: inv.invoiceNumber,
        description: `Ontvangst ${inv.invoiceNumber} ${inv.customerName}`,
        lines: [
          { account: "1100", description: `Ontvangst ${inv.invoiceNumber}`, ...post(gross, "D") },
          { account: "1300", description: `Afboeking ${inv.invoiceNumber}`, ...post(gross, "C"), customerId: inv.customerId },
        ],
      });
    }
  }

  for (const e of expenses) {
    if (!inYear(e.date)) continue;
    const gross = r2(e.amountGross);
    const vat = r2(e.vatAmount);
    const net = r2(gross - vat);
    const account = EXPENSE_ACCOUNT[e.category] ?? "4900";
    const lines: JournalLine[] = [
      {
        account, description: `${e.vendor}${e.description ? " — " + e.description : ""}`, ...post(net, "D"),
        vatCode: vatCode(e.vatRate), vatPerc: e.vatRate, vatAmount: r2(Math.abs(vat)), vatAmountType: sideOf(vat, "D"),
      },
    ];
    if (vat !== 0) lines.push({ account: "1520", description: `Voorbelasting ${e.vendor}`, ...post(vat, "D") });
    lines.push({ account: "1600", description: e.vendor, ...post(gross, "C") });
    entries.push({ journal: "INK", date: e.date, reference: e.id.slice(-8).toUpperCase(), description: `Inkoop ${e.vendor}`, lines });
  }

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Betaaldatum voor de export. Elke betaalde factuur hoort een vastgelegde
 * betaaldatum (paidAt) te hebben: de schrijfpaden vullen hem, en
 * prisma/sql/2026-11-18-factuur-betaaldatum.sql vult hem één keer in voor oude
 * facturen. Ontbreekt hij toch (de SQL is nog niet gedraaid), dan de datum van
 * de gekoppelde bankontvangst, en anders het laatste wijzigmoment. Die laatste
 * terugval is onzeker (updatedAt schuift mee met elke wijziging); de route haalt
 * zulke facturen daarom alleen op in het jaar van de factuurdatum, zodat een
 * ontvangst nooit in twee jaren terechtkomt.
 */
export function paidDateForExport(
  invoice: { status: string; paidAt?: Date | null; updatedAt: Date },
  bankDate?: Date | null,
): Date | null {
  if (invoice.status !== "PAID") return null;
  return invoice.paidAt ?? bankDate ?? invoice.updatedAt;
}

export interface AuditfileNotes {
  /** Vervallen nummers (nooit uitgereikte concepten): geen bedrag en geen boeking. */
  canceled: string[];
  /** Facturen in een andere valuta dan euro: niet in de export. */
  foreignCurrency: { invoiceNumber: string; currency: string }[];
}

/** Wat er bewust niet in de auditfile en journaalposten staat, om aan de gebruiker te tonen. */
export function auditfileNotes(invoices: { invoiceNumber: string; status: string; currency?: string | null }[]): AuditfileNotes {
  return {
    canceled: invoices.filter((i) => i.status === "CANCELED").map((i) => i.invoiceNumber),
    foreignCurrency: invoices
      .filter((i) => isExportedInvoiceStatus(i.status) && !isEuro(i.currency))
      .map((i) => ({ invoiceNumber: i.invoiceNumber, currency: (i.currency ?? "").trim().toUpperCase() })),
  };
}

/** Eén regel van de beginbalans (XAF obLine). */
export interface OpeningLine {
  account: string;
  debit: number;
  credit: number;
}

/**
 * Beginbalans op 1 januari van `year`: alleen Debiteuren (1300).
 * Telt de uitgereikte facturen in euro's met een factuurdatum vóór dit jaar die
 * op 1 januari nog openstonden: niet betaald, of betaald op of na 1 januari.
 * Een betaalde factuur zonder betaaldatum telt als vóór 1 januari betaald (er
 * komt dan ook geen ontvangst in dit jaar). Tegenpost: 0999. Zelfde bedragen
 * als de verkoopboeking (revenueGroups), dus het saldo van 1300 klopt.
 */
export function openingBalance(invoices: XafInvoice[], year: number): OpeningLine[] {
  const start = Date.UTC(year, 0, 1);
  let cents = 0;
  for (const inv of invoices) {
    if (!isExportedInvoiceStatus(inv.status) || !isEuro(inv.currency)) continue;
    if (inv.issueDate.getTime() >= start) continue;
    const paidBefore = inv.status === "PAID" && (!inv.paidAt || inv.paidAt.getTime() < start);
    if (paidBefore) continue;
    cents += revenueGroups(inv).reduce((s, g) => s + toCents(g.base) + toCents(g.vat), 0);
  }
  if (cents === 0) return [];
  const amount = fromCents(cents);
  return [
    { account: "1300", ...post(amount, "D") },
    { account: "0999", ...post(amount, "C") },
  ];
}

/** Controle: elke post is in balans (debet = credit). */
export function isBalanced(entry: JournalEntry): boolean {
  const d = entry.lines.reduce((s, l) => s + toCents(l.debit), 0);
  const c = entry.lines.reduce((s, l) => s + toCents(l.credit), 0);
  return d === c;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const amt = (n: number) => n.toFixed(2);

/** Optioneel element: alleen uitschrijven als er een waarde is. */
function opt(indent: string, tag: string, value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v ? `\n${indent}<${tag}>${esc(v)}</${tag}>` : "";
}

export interface XafCompany {
  name: string;
  kvk?: string | null;
  vatNumber?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

export interface XafCustomer {
  id: string;
  name: string;
  email?: string | null;
}

/**
 * XML Auditfile Financieel 3.2.
 * Volgorde van de elementen zoals in de openbare elementlijst van XAF 3.2,
 * bijvoorbeeld streetAddress: streetname, city, postalCode, country; en
 * customerSupplier: custSupID, custSupName, eMail, custSupTp. Lege optionele
 * elementen laten we weg.
 * `opening`: de beginbalans (zie openingBalance); leeg = geen obLine.
 */
export function buildXaf(
  company: XafCompany, year: number, entries: JournalEntry[], customers: XafCustomer[],
  generatedAt: Date = new Date(), opening: OpeningLine[] = [],
): string {
  const periods = Array.from({ length: 12 }, (_, i) => i + 1);
  const totalDebit = fromCents(entries.reduce((s, e) => s + e.lines.reduce((x, l) => x + toCents(l.debit), 0), 0));
  const totalCredit = fromCents(entries.reduce((s, e) => s + e.lines.reduce((x, l) => x + toCents(l.credit), 0), 0));
  const journals: Record<string, { id: string; desc: string; type: string }> = {
    VRK: { id: "VRK", desc: "Verkoopboek", type: "S" },
    INK: { id: "INK", desc: "Inkoopboek", type: "P" },
    BNK: { id: "BNK", desc: "Bankboek", type: "B" },
  };
  const byJournal = new Map<string, JournalEntry[]>();
  for (const e of entries) (byJournal.get(e.journal) ?? byJournal.set(e.journal, []).get(e.journal)!).push(e);

  const vatXml = (l: JournalLine) =>
    l.vatCode
      ? `\n          <vat>
            <vatID>${esc(l.vatCode)}</vatID>
            <vatPerc>${(l.vatPerc ?? 0).toFixed(2)}</vatPerc>
            <vatAmnt>${amt(l.vatAmount ?? 0)}</vatAmnt>
            <vatAmntTp>${l.vatAmountType ?? (l.debit > 0 ? "D" : "C")}</vatAmntTp>
          </vat>`
      : "";

  let nr = 0;
  const trx = (e: JournalEntry) => {
    nr++;
    return `      <transaction>
        <nr>${nr}</nr>
        <desc>${esc(e.description)}</desc>
        <periodNumber>${e.date.getUTCMonth() + 1}</periodNumber>
        <trDt>${dateStr(e.date)}</trDt>
        <amnt>${amt(fromCents(e.lines.reduce((s, l) => s + toCents(l.debit), 0)))}</amnt>
        <amntTp>D</amntTp>
${e.lines
  .map(
    (l, i) => `        <trLine>
          <nr>${i + 1}</nr>
          <accID>${l.account}</accID>
          <docRef>${esc(e.reference)}</docRef>
          <effDate>${dateStr(e.date)}</effDate>
          <desc>${esc(l.description)}</desc>
          <amnt>${amt(l.debit > 0 ? l.debit : l.credit)}</amnt>
          <amntTp>${l.debit > 0 ? "D" : "C"}</amntTp>${opt("          ", "custSupID", l.customerId)}${vatXml(l)}
        </trLine>`,
  )
  .join("\n")}
      </transaction>`;
  };

  const hasAddress = [company.street, company.postalCode, company.city].some((v) => (v ?? "").trim());
  const address = hasAddress
    ? `\n    <streetAddress>${opt("      ", "streetname", company.street)}${opt("      ", "city", company.city)}${opt("      ", "postalCode", company.postalCode)}
      <country>NL</country>
    </streetAddress>`
    : "";
  const customersXml = customers.length
    ? `\n    <customersSuppliers>
${customers.map((c) => `      <customerSupplier>
        <custSupID>${esc(c.id)}</custSupID>${opt("        ", "custSupName", c.name)}${opt("        ", "eMail", c.email)}
        <custSupTp>C</custSupTp>
      </customerSupplier>`).join("\n")}
    </customersSuppliers>`
    : "";
  const vatCodesXml = VAT_CODES.map((v) => `      <vatCode>
        <vatID>${v.id}</vatID>
        <vatDesc>${esc(v.desc)}</vatDesc>${v.payable ? `
        <vatToPayAccID>1500</vatToPayAccID>
        <vatToClaimAccID>1520</vatToClaimAccID>` : ""}
      </vatCode>`).join("\n");
  const journalsXml = [...byJournal.entries()].map(([j, list]) => `      <journal>
        <jrnID>${journals[j].id}</jrnID>
        <desc>${journals[j].desc}</desc>
        <jrnTp>${journals[j].type}</jrnTp>
${list.map(trx).join("\n")}
      </journal>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<auditfile xmlns="http://www.auditfiles.nl/XAF/3.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <header>
    <fiscalYear>${year}</fiscalYear>
    <startDate>${year}-01-01</startDate>
    <endDate>${year}-12-31</endDate>
    <curCode>EUR</curCode>
    <dateCreated>${dateStr(generatedAt)}</dateCreated>
    <softwareDesc>Saldova</softwareDesc>
    <softwareVersion>1.0</softwareVersion>
  </header>
  <company>${opt("    ", "companyIdent", company.kvk)}
    <companyName>${esc(company.name)}</companyName>
    <taxRegistrationCountry>NL</taxRegistrationCountry>${opt("    ", "taxRegIdent", company.vatNumber)}${address}${customersXml}
    <generalLedger>
${LEDGER.map((a) => `      <ledgerAccount>
        <accID>${a.id}</accID>
        <accDesc>${esc(a.name)}</accDesc>
        <accTp>${a.type}</accTp>
      </ledgerAccount>`).join("\n")}
    </generalLedger>
    <vatCodes>
${vatCodesXml}
    </vatCodes>
    <periods>
${periods.map((p) => `      <period>
        <periodNumber>${p}</periodNumber>
        <periodDesc>${year}-${String(p).padStart(2, "0")}</periodDesc>
        <startDatePeriod>${year}-${String(p).padStart(2, "0")}-01</startDatePeriod>
        <endDatePeriod>${dateStr(new Date(Date.UTC(year, p, 0)))}</endDatePeriod>
      </period>`).join("\n")}
    </periods>
    <openingBalance>
      <opBalDate>${year}-01-01</opBalDate>${opening.length ? `
      <opBalDesc>Beginbalans debiteuren (openstaande facturen uit eerdere jaren)</opBalDesc>` : ""}
      <linesCount>${opening.length}</linesCount>
      <totalDebit>${amt(fromCents(opening.reduce((s, l) => s + toCents(l.debit), 0)))}</totalDebit>
      <totalCredit>${amt(fromCents(opening.reduce((s, l) => s + toCents(l.credit), 0)))}</totalCredit>${opening.map((l, i) => `
      <obLine>
        <nr>${i + 1}</nr>
        <accID>${l.account}</accID>
        <amnt>${amt(l.debit > 0 ? l.debit : l.credit)}</amnt>
        <amntTp>${l.debit > 0 ? "D" : "C"}</amntTp>
      </obLine>`).join("")}
    </openingBalance>
    <transactions>
      <linesCount>${entries.reduce((s, e) => s + e.lines.length, 0)}</linesCount>
      <totalDebit>${amt(totalDebit)}</totalDebit>
      <totalCredit>${amt(totalCredit)}</totalCredit>${journalsXml.length ? "\n" + journalsXml.join("\n") : ""}
    </transactions>
  </company>
</auditfile>
`;
}

/** Journaalposten-CSV (Excel-NL: BOM, puntkomma, komma-decimaal; tekst veilig tegen formules). */
export function journalCsv(entries: JournalEntry[]): string {
  const money = (n: number) => csvAmount(n.toFixed(2).replace(".", ","));
  const header = ["Datum", "Dagboek", "Boekstuk", "Grootboek", "Grootboeknaam", "Omschrijving", "Debet", "Credit", "Btw-code", "Relatie-id"];
  const names = new Map(LEDGER.map((a) => [a.id, a.name]));
  const rows = entries.flatMap((e) =>
    e.lines.map((l) => [dateStr(e.date), e.journal, e.reference, l.account, names.get(l.account) ?? "", l.description, money(l.debit), money(l.credit), l.vatCode ?? "", l.customerId ?? ""]),
  );
  return toCsv([header, ...rows]);
}
