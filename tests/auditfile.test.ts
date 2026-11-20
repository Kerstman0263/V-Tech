import { describe, expect, it } from "vitest";
import {
  auditfileNotes, buildJournal, buildXaf, isBalanced, journalCsv, LEDGER, openingBalance, paidDateForExport, revenueGroups,
  salesVatCode, vatCode, VAT_CODES, type JournalEntry,
} from "@/lib/auditfile";

const inv = (o: Partial<Parameters<typeof buildJournal>[0][number]> = {}) => ({
  id: "inv1", invoiceNumber: "2026-0001", issueDate: new Date("2026-03-01T00:00:00Z"), status: "SENT",
  subtotal: 100, vatAmount: 21, total: 121, customerId: "c1", customerName: "Klant BV", paidAt: null, ...o,
});
const exp = (o: Partial<Parameters<typeof buildJournal>[1][number]> = {}) => ({
  id: "expense00000001", date: new Date("2026-04-10T00:00:00Z"), vendor: "Coolblue", description: "Laptop", category: "EQUIPMENT",
  amountGross: 1210, vatRate: 21, vatAmount: 210, ...o,
});

describe("buildJournal", () => {
  it("verkoopfactuur: debiteuren tegen omzet + btw, in balans", () => {
    const [e] = buildJournal([inv()], [], 2026);
    expect(e.journal).toBe("VRK");
    expect(e.lines.map((l) => l.account)).toEqual(["1300", "8000", "1500"]);
    expect(isBalanced(e)).toBe(true);
    expect(e.lines[1].vatCode).toBe("H");
  });
  it("betaalde factuur krijgt ook een bankboeking", () => {
    const es = buildJournal([inv({ status: "PAID", paidAt: new Date("2026-03-15T00:00:00Z") })], [], 2026);
    expect(es.map((e) => e.journal)).toEqual(["VRK", "BNK"]);
    expect(es[1].lines.map((l) => l.account)).toEqual(["1100", "1300"]);
    expect(isBalanced(es[1])).toBe(true);
  });
  it("creditfactuur (negatief) boekt omgekeerd en blijft in balans", () => {
    const [e] = buildJournal([inv({ subtotal: -100, vatAmount: -21, total: -121 })], [], 2026);
    expect(e.lines[0].credit).toBe(121);
    expect(e.lines[1].debit).toBe(100);
    expect(e.lines[1].vatAmountType).toBe("D");
    expect(isBalanced(e)).toBe(true);
  });
  it("uitgave: kostenrekening per categorie + voorbelasting tegen crediteuren", () => {
    const [e] = buildJournal([], [exp()], 2026);
    expect(e.journal).toBe("INK");
    expect(e.lines.map((l) => l.account)).toEqual(["4200", "1520", "1600"]);
    expect(e.lines[0].debit).toBe(1000);
    expect(e.lines[0]).toMatchObject({ vatCode: "H", vatPerc: 21, vatAmount: 210, vatAmountType: "D" });
    expect(isBalanced(e)).toBe(true);
  });
  it("concepten en andere jaren worden overgeslagen; sortering op datum", () => {
    const es = buildJournal([inv({ status: "DRAFT" }), inv({ id: "x", issueDate: new Date("2025-12-31T00:00:00Z") })], [exp()], 2026);
    expect(es.length).toBe(1);
  });

  // Bevinding 8: een vervallen concept is nooit uitgereikt en is geen omzet.
  it("vervallen concepten (CANCELED) krijgen geen boeking", () => {
    const es = buildJournal([inv({ status: "CANCELED" }), inv({ id: "i2", invoiceNumber: "2026-0002" })], [], 2026);
    expect(es).toHaveLength(1);
    expect(es[0].reference).toBe("2026-0002");
    expect(es.flatMap((e) => e.lines).some((l) => l.description.includes("2026-0001"))).toBe(false);
  });
  it("te late facturen tellen wel mee", () => {
    expect(buildJournal([inv({ status: "OVERDUE" })], [], 2026)).toHaveLength(1);
  });
});

// Bevinding 44: btw per tarief, betalingen over de jaargrens, echte betaaldatum, valuta.
describe("auditfile: tarieven, betalingen en valuta", () => {
  const mixed = inv({
    subtotal: 200, vatAmount: 30, total: 230,
    lines: [{ lineTotal: 100, vatRate: 21 }, { lineTotal: 100, vatRate: 9 }],
  });

  it("factuur met 21% en 9% krijgt een omzetregel per tarief met de juiste code", () => {
    const [e] = buildJournal([mixed], [], 2026);
    const revenue = e.lines.filter((l) => l.account === "8000");
    expect(revenue.map((l) => [l.vatCode, l.credit, l.vatAmount])).toEqual([["H", 100, 21], ["L", 100, 9]]);
    const vat = e.lines.filter((l) => l.account === "1500").map((l) => l.credit);
    expect(vat).toEqual([21, 9]);
    expect(e.lines[0].debit).toBe(230);
    expect(isBalanced(e)).toBe(true);
  });

  it("valt terug op één regel als de regels niet optellen tot de opgeslagen totalen", () => {
    const groups = revenueGroups({ subtotal: 100, vatAmount: 21, lines: [{ lineTotal: 90, vatRate: 21 }] });
    expect(groups).toEqual([{ rate: 21, base: 100, vat: 21 }]);
  });

  it("creditfactuur met gemengde tarieven blijft in balans", () => {
    const [e] = buildJournal([inv({ subtotal: -200, vatAmount: -30, total: -230, lines: [{ lineTotal: -100, vatRate: 21 }, { lineTotal: -100, vatRate: 9 }] })], [], 2026);
    expect(e.lines[0].credit).toBe(230);
    expect(e.lines.filter((l) => l.account === "8000").map((l) => l.debit)).toEqual([100, 100]);
    expect(isBalanced(e)).toBe(true);
  });

  it("btw verlegd en ICL krijgen een eigen 0%-code", () => {
    expect(salesVatCode(0, "REVERSE_NL")).toBe("V");
    expect(salesVatCode(0, "REVERSE_EU")).toBe("E");
    expect(salesVatCode(0, "ICL")).toBe("I");
    expect(salesVatCode(0, null)).toBe("N");
    expect(salesVatCode(21, "REVERSE_NL")).toBe("H");
    const [e] = buildJournal([inv({ subtotal: 100, vatAmount: 0, total: 100, vatScheme: "REVERSE_EU", lines: [{ lineTotal: 100, vatRate: 0 }] })], [], 2026);
    expect(e.lines.map((l) => l.account)).toEqual(["1300", "8000"]);
    expect(e.lines[1].vatCode).toBe("E");
  });

  it("decemberfactuur die in januari betaald is: ontvangst in het nieuwe jaar, geen tweede verkoopboeking", () => {
    const december = inv({ issueDate: new Date("2025-12-20T00:00:00Z"), status: "PAID", paidAt: new Date("2026-01-08T00:00:00Z") });
    const es2026 = buildJournal([december], [], 2026);
    expect(es2026.map((e) => e.journal)).toEqual(["BNK"]);
    expect(es2026[0].date.toISOString().slice(0, 10)).toBe("2026-01-08");
    const es2025 = buildJournal([december], [], 2025);
    expect(es2025.map((e) => e.journal)).toEqual(["VRK"]);
  });

  it("betaaldatum: vastgelegde datum, anders de bankontvangst, anders het laatste wijzigmoment", () => {
    const updatedAt = new Date("2026-06-30T00:00:00Z");
    const bank = new Date("2026-03-10T00:00:00Z");
    expect(paidDateForExport({ status: "PAID", paidAt: new Date("2026-03-05T00:00:00Z"), updatedAt }, bank)?.toISOString().slice(0, 10)).toBe("2026-03-05");
    expect(paidDateForExport({ status: "PAID", paidAt: null, updatedAt }, bank)).toBe(bank);
    expect(paidDateForExport({ status: "PAID", paidAt: null, updatedAt })).toBe(updatedAt);
    expect(paidDateForExport({ status: "SENT", paidAt: null, updatedAt }, bank)).toBeNull();
  });

  it("facturen in een andere valuta staan niet in de journaalposten, maar wel in de melding", () => {
    const es = buildJournal([inv({ currency: "USD" }), inv({ id: "i2", invoiceNumber: "2026-0002", currency: "EUR" })], [], 2026);
    expect(es.map((e) => e.reference)).toEqual(["2026-0002"]);
    const notes = auditfileNotes([
      { invoiceNumber: "2026-0001", status: "SENT", currency: "usd" },
      { invoiceNumber: "2026-0002", status: "PAID", currency: "EUR" },
      { invoiceNumber: "2026-0003", status: "CANCELED", currency: "EUR" },
      { invoiceNumber: "2026-0004", status: "DRAFT", currency: "GBP" },
    ]);
    expect(notes).toEqual({ canceled: ["2026-0003"], foreignCurrency: [{ invoiceNumber: "2026-0001", currency: "USD" }] });
  });
});

describe("vatCode", () => {
  it("21 -> H, 9 -> L, 0 -> N", () => {
    expect(vatCode(21)).toBe("H"); expect(vatCode(9)).toBe("L"); expect(vatCode(0)).toBe("N");
  });
});

// --- Kleine XML-lezer voor de structuurtest (geen officiële XSD-validatie) ---
interface XmlNode { name: string; children: XmlNode[]; text: string }
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", children: [], text: "" };
  const stack: XmlNode[] = [root];
  const re = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;
  const body = xml.replace(/^<\?xml[^>]*\?>/, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[5] !== undefined) { stack[stack.length - 1].text += m[5]; continue; }
    const [, closing, name, , selfClosing] = m;
    if (closing) {
      const node = stack.pop()!;
      expect(node.name).toBe(name);
      continue;
    }
    const node: XmlNode = { name, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  expect(stack).toHaveLength(1);
  return root.children[0];
}

/**
 * Volgorde van de kind-elementen volgens de openbare elementlijst van XAF 3.2
 * (zoals bekend, niet uit het officiële XSD gehaald). Elk kind moet in de lijst
 * staan en de volgorde moet kloppen; optionele elementen mogen ontbreken.
 */
const XAF_ORDER: Record<string, string[]> = {
  auditfile: ["header", "company"],
  header: ["fiscalYear", "startDate", "endDate", "curCode", "dateCreated", "softwareDesc", "softwareVersion"],
  company: ["companyIdent", "companyName", "taxRegistrationCountry", "taxRegIdent", "streetAddress", "postalAddress", "customersSuppliers", "generalLedger", "vatCodes", "periods", "openingBalance", "transactions"],
  streetAddress: ["streetname", "number", "numberExtension", "property", "city", "postalCode", "region", "country"],
  customersSuppliers: ["customerSupplier"],
  customerSupplier: ["custSupID", "custSupName", "contact", "telephone", "fax", "eMail", "website", "commerceNr", "taxRegistrationCountry", "taxRegIdent", "relationshipID", "custSupTp", "custSupGrpID", "custCreditLimit", "suppCreditLimit", "streetAddress", "postalAddress", "bankAccount", "changeInfo", "customerSupplierHistory"],
  generalLedger: ["ledgerAccount"],
  ledgerAccount: ["accID", "accDesc", "accTp", "leadCode", "leadDescription", "leadReference", "leadCrossRef", "changeInfo", "glAccountHistory", "taxonomies"],
  vatCodes: ["vatCode"],
  vatCode: ["vatID", "vatDesc", "vatToPayAccID", "vatToClaimAccID"],
  periods: ["period"],
  period: ["periodNumber", "periodDesc", "startDatePeriod", "startTimePeriod", "endDatePeriod", "endTimePeriod"],
  openingBalance: ["opBalDate", "opBalDesc", "linesCount", "totalDebit", "totalCredit", "obLine", "obSubledgers"],
  obLine: ["nr", "accID", "amnt", "amntTp"],
  transactions: ["linesCount", "totalDebit", "totalCredit", "journal"],
  journal: ["jrnID", "desc", "jrnTp", "offsetAccID", "bankAccNr", "transaction"],
  transaction: ["nr", "desc", "periodNumber", "trDt", "amnt", "amntTp", "sourceID", "userID", "trLine"],
  trLine: ["nr", "accID", "docRef", "effDate", "desc", "amnt", "amntTp", "recRef", "matchKeyID", "custSupID", "invRef", "orderRef", "receivingDocRef", "shipDocRef", "costID", "prodID", "projID", "artGrpID", "qntityID", "qntity", "vat", "currency"],
  vat: ["vatID", "vatPerc", "vatAmnt", "vatAmntTp"],
};
const XAF_REQUIRED: Record<string, string[]> = {
  header: ["fiscalYear", "startDate", "endDate", "curCode", "dateCreated", "softwareDesc", "softwareVersion"],
  company: ["companyName", "taxRegistrationCountry", "generalLedger", "periods"],
  ledgerAccount: ["accID", "accDesc", "accTp"],
  vatCode: ["vatID", "vatDesc"],
  transaction: ["nr", "periodNumber", "trDt", "amnt", "amntTp", "trLine"],
  trLine: ["nr", "accID", "docRef", "effDate", "amnt", "amntTp"],
  vat: ["vatID", "vatPerc", "vatAmnt", "vatAmntTp"],
  openingBalance: ["opBalDate", "linesCount", "totalDebit", "totalCredit"],
  obLine: ["nr", "accID", "amnt", "amntTp"],
};

function checkOrder(node: XmlNode, problems: string[]) {
  const order = XAF_ORDER[node.name];
  if (order) {
    let last = -1;
    for (const child of node.children) {
      const index = order.indexOf(child.name);
      if (index < 0) problems.push(`${node.name} bevat onbekend element ${child.name}`);
      else if (index < last) problems.push(`${node.name}: ${child.name} staat te laat`);
      else last = index;
    }
  }
  for (const required of XAF_REQUIRED[node.name] ?? []) {
    if (!node.children.some((c) => c.name === required)) problems.push(`${node.name} mist ${required}`);
  }
  if (node.children.length === 0 && !node.text.trim()) problems.push(`leeg element ${node.name}`);
  node.children.forEach((c) => checkOrder(c, problems));
}

const find = (node: XmlNode, name: string): XmlNode[] =>
  [...(node.name === name ? [node] : []), ...node.children.flatMap((c) => find(c, name))];
const childText = (node: XmlNode, name: string) => node.children.find((c) => c.name === name)?.text.trim() ?? "";

/**
 * De verwijzingen die het XAF 3.2-XSD als keyref afdwingt (zoals bekend; geen
 * officiële XSD-validatie): elke rekening, btw-code, relatie en periode waar
 * een boeking naar verwijst, moet in hetzelfde bestand gedefinieerd zijn.
 */
function checkReferences(root: XmlNode, problems: string[]) {
  const accounts = new Set(find(root, "ledgerAccount").map((a) => childText(a, "accID")));
  const vatIds = new Set(find(root, "vatCode").map((v) => childText(v, "vatID")));
  const custSups = new Set(find(root, "customerSupplier").map((c) => childText(c, "custSupID")));
  const periodNrs = new Set(find(root, "period").map((p) => childText(p, "periodNumber")));
  for (const line of [...find(root, "trLine"), ...find(root, "obLine")]) {
    const acc = childText(line, "accID");
    if (!accounts.has(acc)) problems.push(`rekening ${acc} staat niet in generalLedger`);
  }
  for (const code of find(root, "vatCode")) {
    for (const ref of ["vatToPayAccID", "vatToClaimAccID"]) {
      const acc = childText(code, ref);
      if (acc && !accounts.has(acc)) problems.push(`${ref} ${acc} staat niet in generalLedger`);
    }
  }
  for (const vat of find(root, "vat")) {
    const id = childText(vat, "vatID");
    if (!vatIds.has(id)) problems.push(`btw-code ${id} staat niet in vatCodes`);
  }
  for (const line of find(root, "trLine")) {
    const id = childText(line, "custSupID");
    if (id && !custSups.has(id)) problems.push(`relatie ${id} staat niet in customersSuppliers`);
  }
  for (const trx of find(root, "transaction")) {
    const nr = childText(trx, "periodNumber");
    if (!periodNrs.has(nr) || Number(nr) < 1 || Number(nr) > 12) problems.push(`periode ${nr} bestaat niet`);
  }
}

describe("buildXaf / journalCsv", () => {
  const entries = buildJournal([inv({ status: "PAID", paidAt: new Date("2026-03-15T00:00:00Z") })], [exp()], 2026);
  it("levert XAF 3.2 met totalen in balans en escaped tekst", () => {
    const xml = buildXaf({ name: "Test & Co <BV>", kvk: "12345678", vatNumber: "NL001234567B01" }, 2026, entries, [{ id: "c1", name: "Klant BV" }], new Date("2026-08-27T00:00:00Z"));
    expect(xml).toContain('<auditfile xmlns="http://www.auditfiles.nl/XAF/3.2"');
    expect(xml).toContain("<companyName>Test &amp; Co &lt;BV&gt;</companyName>");
    expect(xml).toContain("<fiscalYear>2026</fiscalYear>");
    const d = xml.match(/<totalDebit>([\d.]+)<\/totalDebit>/g)!.pop();
    const c = xml.match(/<totalCredit>([\d.]+)<\/totalCredit>/g)!.pop();
    expect(d!.replace(/\D/g, "")).toBe(c!.replace(/\D/g, ""));
    expect(xml).toContain("<jrnID>VRK</jrnID>");
    expect(xml).toContain("<custSupID>c1</custSupID>");
  });

  // Bevinding 45: volgorde van elementen, verplichte btw-velden, geen lege elementen.
  it("volgt de volgorde van XAF 3.2, met volledige btw-gegevens en zonder lege elementen", () => {
    const mixedEntries: JournalEntry[] = buildJournal(
      [
        inv({ status: "PAID", paidAt: new Date("2026-03-15T00:00:00Z"), subtotal: 200, vatAmount: 30, total: 230, lines: [{ lineTotal: 100, vatRate: 21 }, { lineTotal: 100, vatRate: 9 }] }),
        inv({ id: "i2", invoiceNumber: "2026-0002", subtotal: -100, vatAmount: -21, total: -121 }),
      ],
      [exp()],
      2026,
    );
    const full = buildXaf(
      { name: "Jansen", kvk: "12345678", vatNumber: "NL001234567B01", street: "Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht" },
      2026, mixedEntries, [{ id: "c1", name: "Klant BV", email: "klant@example.nl" }], new Date("2026-08-27T00:00:00Z"),
    );
    const bare = buildXaf({ name: "Jansen" }, 2026, [], [], new Date("2026-08-27T00:00:00Z"));
    for (const xml of [full, bare]) {
      const problems: string[] = [];
      const root = parseXml(xml);
      checkOrder(root, problems);
      checkReferences(root, problems);
      expect(problems).toEqual([]);
    }
    expect(full).toMatch(/<city>Utrecht<\/city>\s*<postalCode>1234 AB<\/postalCode>/);
    expect(full).toMatch(/<eMail>klant@example\.nl<\/eMail>\s*<custSupTp>C<\/custSupTp>/);
    expect(full).not.toContain("<taxonomy>");
    expect(full).toMatch(/<vatID>H<\/vatID>\s*<vatPerc>21\.00<\/vatPerc>\s*<vatAmnt>21\.00<\/vatAmnt>\s*<vatAmntTp>C<\/vatAmntTp>/);
    expect(full).toMatch(/<vatID>L<\/vatID>\s*<vatPerc>9\.00<\/vatPerc>\s*<vatAmnt>9\.00<\/vatAmnt>/);
    // Zonder KvK, btw-nummer en adres: die elementen staan er dan niet in.
    expect(bare).not.toContain("<companyIdent>");
    expect(bare).not.toContain("<taxRegIdent>");
    expect(bare).not.toContain("<streetAddress>");
    expect(bare).not.toContain("<customersSuppliers>");
  });

  // Review nr 45: ook de verwijzingen (keyref) kloppen, voor elke rekening en btw-code.
  it("elke rekening en btw-code die de export kan gebruiken staat in generalLedger en vatCodes", () => {
    const accounts = new Set(LEDGER.map((a) => a.id));
    const codes = new Set(VAT_CODES.map((v) => v.id));
    const categories = ["OFFICE", "TRAVEL", "EQUIPMENT", "SOFTWARE", "PHONE_INTERNET", "MARKETING", "EDUCATION", "INSURANCE", "OTHER", "ONBEKEND"];
    const es = buildJournal(
      [
        inv({ status: "PAID", paidAt: new Date("2026-05-01T00:00:00Z") }),
        ...["REVERSE_NL", "REVERSE_EU", "ICL", null].map((vatScheme, i) =>
          inv({ id: `v${i}`, invoiceNumber: `2026-010${i}`, vatScheme, subtotal: 100, vatAmount: 0, total: 100, lines: [{ lineTotal: 100, vatRate: 0 }] })),
        inv({ id: "m", invoiceNumber: "2026-0200", subtotal: 200, vatAmount: 30, total: 230, lines: [{ lineTotal: 100, vatRate: 21 }, { lineTotal: 100, vatRate: 9 }] }),
      ],
      categories.flatMap((category, i) => [0, 9, 21].map((vatRate) => exp({ id: `expense0000${i}${vatRate}`, category, vatRate, vatAmount: vatRate ? 10 : 0 }))),
      2026,
    );
    const lines = es.flatMap((e) => e.lines);
    expect(lines.filter((l) => !accounts.has(l.account))).toEqual([]);
    expect(lines.filter((l) => l.vatCode && !codes.has(l.vatCode))).toEqual([]);
    expect(new Set(lines.map((l) => l.vatCode).filter(Boolean))).toEqual(new Set(["H", "L", "N", "V", "E", "I"]));
    for (const line of openingBalance([inv({ issueDate: new Date("2025-06-01T00:00:00Z") })], 2026)) expect(accounts.has(line.account)).toBe(true);
    const xml = buildXaf({ name: "Jansen" }, 2026, es, [{ id: "c1", name: "Klant BV" }], new Date("2026-08-27T00:00:00Z"));
    const problems: string[] = [];
    checkReferences(parseXml(xml), problems);
    expect(problems).toEqual([]);
  });

  it("de referentiecontrole vangt een vergeten rekening, btw-code of relatie", () => {
    const broken: JournalEntry[] = [{
      journal: "VRK", date: new Date("2026-03-01T00:00:00Z"), reference: "X", description: "X",
      lines: [
        { account: "9999", description: "x", debit: 1, credit: 0, customerId: "onbekend" },
        { account: "8000", description: "x", debit: 0, credit: 1, vatCode: "Z", vatPerc: 0, vatAmount: 0, vatAmountType: "C" },
      ],
    }];
    const problems: string[] = [];
    checkReferences(parseXml(buildXaf({ name: "Jansen" }, 2026, broken, [], new Date("2026-08-27T00:00:00Z"))), problems);
    expect(problems).toEqual([
      "rekening 9999 staat niet in generalLedger",
      "btw-code Z staat niet in vatCodes",
      "relatie onbekend staat niet in customersSuppliers",
    ]);
  });

  it("csv heeft BOM, puntkomma en komma-decimaal", () => {
    const csv = journalCsv(entries);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"2026-03-01";"VRK";"2026-0001";"1300";"Debiteuren"');
    expect(csv).toContain('"121,00";"0,00"');
  });

  // Bevinding 36: ook de journaalposten-CSV is veilig tegen formules.
  it("csv neutraliseert formules in namen, maar laat bedragen en datums staan", () => {
    const csv = journalCsv(buildJournal([inv({ customerName: "=HYPERLINK(\"https://x\")" })], [exp({ vendor: "+31 Leverancier", description: "@SUM(A1)" })], 2026));
    expect(csv).toContain(`"'=HYPERLINK(""https://x"") — 2026-0001"`);
    expect(csv).toContain(`"'+31 Leverancier — @SUM(A1)"`);
    expect(csv).not.toMatch(/";"=/);
    expect(csv).toContain('"2026-04-10";"INK"');
    const credit = journalCsv(buildJournal([inv({ subtotal: -100, vatAmount: -21, total: -121 })], [], 2026));
    expect(credit).toContain('"0,00";"121,00"');
  });
});

// Review nr 44: beginbalans voor debiteuren en geen dubbele ontvangst over twee jaren.
describe("beginbalans debiteuren", () => {
  const lastYear = (o: Partial<Parameters<typeof buildJournal>[0][number]>) => inv({ issueDate: new Date("2025-12-20T00:00:00Z"), ...o });

  it("telt facturen uit eerdere jaren die op 1 januari nog openstonden", () => {
    const lines = openingBalance([
      lastYear({ id: "a", status: "PAID", paidAt: new Date("2026-01-08T00:00:00Z") }), // in januari betaald: open op 1-1
      lastYear({ id: "b", status: "SENT" }), // nog open
      lastYear({ id: "c", status: "PAID", paidAt: new Date("2025-12-28T00:00:00Z") }), // in december betaald
      lastYear({ id: "d", status: "PAID", paidAt: null }), // betaald zonder datum: telt als eerder betaald
      lastYear({ id: "e", status: "CANCELED" }),
      lastYear({ id: "f", status: "SENT", currency: "USD" }),
      lastYear({ id: "g", status: "OVERDUE", subtotal: -100, vatAmount: -21, total: -121 }), // creditfactuur
      inv({ id: "h", status: "SENT" }), // factuur van dit jaar: geen beginbalans
    ], 2026);
    expect(lines).toEqual([{ account: "1300", debit: 121, credit: 0 }, { account: "0999", debit: 0, credit: 121 }]);
    expect(openingBalance([inv()], 2026)).toEqual([]);
  });

  it("het saldo van 1300 klopt: beginbalans + verkoop - ontvangsten = wat nog openstaat", () => {
    const invoices = [
      lastYear({ id: "a", invoiceNumber: "2025-0040", status: "PAID", paidAt: new Date("2026-01-08T00:00:00Z") }),
      lastYear({ id: "b", invoiceNumber: "2025-0041", status: "SENT", subtotal: 50, vatAmount: 10.5, total: 60.5 }),
      inv({ id: "c", invoiceNumber: "2026-0001", status: "PAID", paidAt: new Date("2026-02-01T00:00:00Z") }),
      inv({ id: "d", invoiceNumber: "2026-0002", status: "SENT" }),
    ];
    const opening = openingBalance(invoices, 2026);
    const entries = buildJournal(invoices, [], 2026);
    const cents = (n: number) => Math.round(n * 100);
    const debtors = [...opening, ...entries.flatMap((e) => e.lines)]
      .filter((l) => l.account === "1300")
      .reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0);
    expect(debtors).toBe(cents(60.5 + 121)); // 2025-0041 en 2026-0002 staan nog open

    const xml = buildXaf({ name: "Jansen" }, 2026, entries, [{ id: "c1", name: "Klant BV" }], new Date("2026-08-27T00:00:00Z"), opening);
    const root = parseXml(xml);
    const problems: string[] = [];
    checkOrder(root, problems);
    checkReferences(root, problems);
    expect(problems).toEqual([]);
    expect(xml).toMatch(/<openingBalance>\s*<opBalDate>2026-01-01<\/opBalDate>\s*<opBalDesc>[^<]+<\/opBalDesc>\s*<linesCount>2<\/linesCount>\s*<totalDebit>181\.50<\/totalDebit>\s*<totalCredit>181\.50<\/totalCredit>/);
    expect(xml).toMatch(/<obLine>\s*<nr>1<\/nr>\s*<accID>1300<\/accID>\s*<amnt>181\.50<\/amnt>\s*<amntTp>D<\/amntTp>\s*<\/obLine>/);
    expect(xml).toMatch(/<accID>0999<\/accID>\s*<amnt>181\.50<\/amnt>\s*<amntTp>C<\/amntTp>/);
  });

  it("zonder openstaande facturen uit eerdere jaren: lege beginbalans zonder obLine", () => {
    const xml = buildXaf({ name: "Jansen" }, 2026, [], [], new Date("2026-08-27T00:00:00Z"), []);
    expect(xml).toMatch(/<linesCount>0<\/linesCount>\s*<totalDebit>0\.00<\/totalDebit>\s*<totalCredit>0\.00<\/totalCredit>\s*<\/openingBalance>/);
    expect(xml).not.toContain("<obLine>");
    expect(xml).not.toContain("<opBalDesc>");
  });

  it("een in 2025 betaalde factuur die in 2026 gecrediteerd wordt, krijgt in 2026 geen tweede ontvangst", () => {
    // Factuur 2025-0010, in 2025 betaald; in maart 2026 komt er een creditfactuur (updatedAt schuift mee).
    const paid = inv({ id: "x", invoiceNumber: "2025-0010", issueDate: new Date("2025-05-01T00:00:00Z"), status: "PAID", paidAt: new Date("2025-06-01T00:00:00Z") });
    expect(buildJournal([paid], [], 2025).map((e) => e.journal)).toEqual(["VRK", "BNK"]);
    expect(buildJournal([paid], [], 2026)).toEqual([]);
    expect(openingBalance([paid], 2026)).toEqual([]);
  });
});
