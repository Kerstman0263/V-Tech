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
 *   1520 Btw voorbelasting
 *
 * Twee formaten:
 *  - XML Auditfile Financieel 3.2 (.xaf) — de Nederlandse standaard van de
 *    Belastingdienst; importeerbaar in Exact, SnelStart, e-Boekhouden, Twinfield, ….
 *  - Journaalposten-CSV — één regel per boekingsregel (datum, dagboek, rekening,
 *    debet, credit, btw-code), voor "boekingen importeren" in elk pakket.
 *
 * Alles hier is puur (geen database) en getest.
 */

export interface LedgerAccount {
  id: string;
  name: string;
  type: "B" | "P"; // balans / winst & verlies
}

export const LEDGER: LedgerAccount[] = [
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

export interface JournalLine {
  account: string;
  description: string;
  debit: number;
  credit: number;
  vatCode?: string; // "H" 21% / "L" 9% / "N" 0%
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
  paidAt?: Date | null;
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

export function vatCode(rate: number): string {
  if (rate >= 20) return "H";
  if (rate > 0) return "L";
  return "N";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Journaalposten uit facturen (niet-concept) en uitgaven van één jaar. */
export function buildJournal(invoices: XafInvoice[], expenses: XafExpense[], year: number): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const inYear = (d: Date) => d.getUTCFullYear() === year;

  for (const inv of invoices) {
    if (inv.status === "DRAFT" || !inYear(inv.issueDate)) continue;
    const net = r2(inv.subtotal);
    const vat = r2(inv.vatAmount);
    const gross = r2(inv.total);
    const sign = gross < 0 ? -1 : 1; // creditfactuur: bedragen negatief -> boekingen omgekeerd
    const lines: JournalLine[] = [
      { account: "1300", description: `${inv.customerName} — ${inv.invoiceNumber}`, debit: sign > 0 ? gross : 0, credit: sign > 0 ? 0 : -gross, customerId: inv.customerId },
      { account: "8000", description: `Omzet ${inv.invoiceNumber}`, debit: sign > 0 ? 0 : -net, credit: sign > 0 ? net : 0, vatCode: vatCode(net !== 0 ? (vat / Math.abs(net)) * 100 : 0) },
    ];
    if (vat !== 0) lines.push({ account: "1500", description: `Btw ${inv.invoiceNumber}`, debit: sign > 0 ? 0 : -vat, credit: sign > 0 ? vat : 0 });
    entries.push({ journal: "VRK", date: inv.issueDate, reference: inv.invoiceNumber, description: `Factuur ${inv.invoiceNumber} ${inv.customerName}`, lines });

    // Betaling: bank tegen debiteuren (alleen als de factuur betaald is, in hetzelfde jaar)
    if (inv.status === "PAID" && inv.paidAt && inYear(inv.paidAt)) {
      entries.push({
        journal: "BNK",
        date: inv.paidAt,
        reference: inv.invoiceNumber,
        description: `Ontvangst ${inv.invoiceNumber} ${inv.customerName}`,
        lines: [
          { account: "1100", description: `Ontvangst ${inv.invoiceNumber}`, debit: sign > 0 ? gross : 0, credit: sign > 0 ? 0 : -gross },
          { account: "1300", description: `Afboeking ${inv.invoiceNumber}`, debit: sign > 0 ? 0 : -gross, credit: sign > 0 ? gross : 0, customerId: inv.customerId },
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
      { account, description: `${e.vendor}${e.description ? " — " + e.description : ""}`, debit: net, credit: 0, vatCode: vatCode(e.vatRate) },
    ];
    if (vat !== 0) lines.push({ account: "1520", description: `Voorbelasting ${e.vendor}`, debit: vat, credit: 0 });
    lines.push({ account: "1600", description: e.vendor, debit: 0, credit: gross });
    entries.push({ journal: "INK", date: e.date, reference: e.id.slice(-8).toUpperCase(), description: `Inkoop ${e.vendor}`, lines });
  }

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Controle: elke post is in balans (debet = credit). */
export function isBalanced(entry: JournalEntry): boolean {
  const d = entry.lines.reduce((s, l) => s + l.debit, 0);
  const c = entry.lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(d - c) < 0.005;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const amt = (n: number) => n.toFixed(2);

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

/** XML Auditfile Financieel 3.2 (Belastingdienst-standaard). */
export function buildXaf(company: XafCompany, year: number, entries: JournalEntry[], customers: XafCustomer[], generatedAt: Date = new Date()): string {
  const periods = Array.from({ length: 12 }, (_, i) => i + 1);
  const totalDebit = entries.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.debit, 0), 0);
  const totalCredit = entries.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.credit, 0), 0);
  const journals: Record<string, { id: string; desc: string; type: string }> = {
    VRK: { id: "VRK", desc: "Verkoopboek", type: "S" },
    INK: { id: "INK", desc: "Inkoopboek", type: "P" },
    BNK: { id: "BNK", desc: "Bankboek", type: "B" },
  };
  const byJournal = new Map<string, JournalEntry[]>();
  for (const e of entries) (byJournal.get(e.journal) ?? byJournal.set(e.journal, []).get(e.journal)!).push(e);

  let nr = 0;
  const trx = (e: JournalEntry) => {
    nr++;
    return `      <transaction>
        <nr>${nr}</nr>
        <desc>${esc(e.description)}</desc>
        <periodNumber>${e.date.getUTCMonth() + 1}</periodNumber>
        <trDt>${dateStr(e.date)}</trDt>
        <amnt>${amt(e.lines.reduce((s, l) => s + l.debit, 0))}</amnt>
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
          <amntTp>${l.debit > 0 ? "D" : "C"}</amntTp>${l.customerId ? `\n          <custSupID>${esc(l.customerId)}</custSupID>` : ""}${l.vatCode ? `\n          <vat><vatID>${l.vatCode}</vatID></vat>` : ""}
        </trLine>`,
  )
  .join("\n")}
      </transaction>`;
  };

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
  <company>
    <companyIdent>${esc(company.kvk ?? "")}</companyIdent>
    <companyName>${esc(company.name)}</companyName>
    <taxRegistrationCountry>NL</taxRegistrationCountry>
    <taxRegIdent>${esc(company.vatNumber ?? "")}</taxRegIdent>
    <streetAddress>
      <streetname>${esc(company.street ?? "")}</streetname>
      <postalCode>${esc(company.postalCode ?? "")}</postalCode>
      <city>${esc(company.city ?? "")}</city>
      <country>NL</country>
    </streetAddress>
    <customersSuppliers>
${customers.map((c) => `      <customerSupplier>
        <custSupID>${esc(c.id)}</custSupID>
        <custSupName>${esc(c.name)}</custSupName>
        <custSupTp>C</custSupTp>${c.email ? `\n        <eMail>${esc(c.email)}</eMail>` : ""}
      </customerSupplier>`).join("\n")}
    </customersSuppliers>
    <generalLedger>
      <taxonomy>Saldova</taxonomy>
${LEDGER.map((a) => `      <ledgerAccount>
        <accID>${a.id}</accID>
        <accDesc>${esc(a.name)}</accDesc>
        <accTp>${a.type}</accTp>
      </ledgerAccount>`).join("\n")}
    </generalLedger>
    <vatCodes>
      <vatCode><vatID>H</vatID><vatDesc>Btw hoog 21%</vatDesc><vatToPayAccID>1500</vatToPayAccID><vatToClaimAccID>1520</vatToClaimAccID></vatCode>
      <vatCode><vatID>L</vatID><vatDesc>Btw laag 9%</vatDesc><vatToPayAccID>1500</vatToPayAccID><vatToClaimAccID>1520</vatToClaimAccID></vatCode>
      <vatCode><vatID>N</vatID><vatDesc>Geen btw / vrijgesteld</vatDesc><vatToPayAccID>1500</vatToPayAccID><vatToClaimAccID>1520</vatToClaimAccID></vatCode>
    </vatCodes>
    <periods>
${periods.map((p) => `      <period><periodNumber>${p}</periodNumber><periodDesc>${year}-${String(p).padStart(2, "0")}</periodDesc><startDatePeriod>${year}-${String(p).padStart(2, "0")}-01</startDatePeriod><endDatePeriod>${dateStr(new Date(Date.UTC(year, p, 0)))}</endDatePeriod></period>`).join("\n")}
    </periods>
    <openingBalance>
      <opBalDate>${year}-01-01</opBalDate>
      <linesCount>0</linesCount>
      <totalDebit>0.00</totalDebit>
      <totalCredit>0.00</totalCredit>
    </openingBalance>
    <transactions>
      <linesCount>${entries.reduce((s, e) => s + e.lines.length, 0)}</linesCount>
      <totalDebit>${amt(totalDebit)}</totalDebit>
      <totalCredit>${amt(totalCredit)}</totalCredit>
${[...byJournal.entries()].map(([j, list]) => `      <journal>
        <jrnID>${journals[j].id}</jrnID>
        <desc>${journals[j].desc}</desc>
        <jrnTp>${journals[j].type}</jrnTp>
${list.map(trx).join("\n")}
      </journal>`).join("\n")}
    </transactions>
  </company>
</auditfile>
`;
}

/** Journaalposten-CSV (Excel-NL: BOM, puntkomma, komma-decimaal). */
export function journalCsv(entries: JournalEntry[]): string {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const money = (n: number) => n.toFixed(2).replace(".", ",");
  const header = ["Datum", "Dagboek", "Boekstuk", "Grootboek", "Grootboeknaam", "Omschrijving", "Debet", "Credit", "Btw-code", "Relatie-id"];
  const names = new Map(LEDGER.map((a) => [a.id, a.name]));
  const rows = entries.flatMap((e) =>
    e.lines.map((l) => [dateStr(e.date), e.journal, e.reference, l.account, names.get(l.account) ?? "", l.description, money(l.debit), money(l.credit), l.vatCode ?? "", l.customerId ?? ""]),
  );
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}
