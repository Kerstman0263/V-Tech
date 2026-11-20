import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { fitPdfText, pdfSafeText, wrapPdfText } from "@/lib/pdf-text";
import { vatBreakdown } from "@/lib/vat-breakdown";

/**
 * Genereert een factuur- of offerte-PDF met pdf-lib (geen headless browser
 * nodig, dus serverless-vriendelijk op Vercel). Geeft een Uint8Array terug.
 *
 * - Meerdere pagina's: regels lopen door op een volgende pagina met dezelfde
 *   kop en kolomkoppen; het totaalblok (met btw per tarief) komt na de laatste
 *   regel. Elke pagina krijgt "pagina x van y".
 * - Lange omschrijvingen en opmerkingen worden over regels afgebroken, nooit
 *   afgekapt.
 * - Alle tekst gaat door pdfSafeText, zodat onbekende tekens (ł, ő, emoji)
 *   de PDF niet laten mislukken.
 */

export interface PdfLabels {
  invoice: string;
  creditInvoice: string;
  number: string;
  date: string;
  due: string;
  deliveryDate: string;
  deliveryPeriod: string;
  /** "{start} t/m {end}" */
  periodRange: string;
  recipient: string;
  vatNumber: string;
  kvkNumber: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vat: string;
  lineTotal: string;
  subtotal: string;
  /** "Btw {rate}% over {base}" */
  vatOver: string;
  /** "Btw verlegd over {base}" (btw verlegd: de afnemer draagt af) */
  vatReverseOver: string;
  /** Landcode van de klant, bijv. "Land: BE" */
  country: string;
  vatTotal: string;
  total: string;
  notes: string;
  paymentDetails: string;
  scanToPay: string;
  /** "pagina {page} van {pages}" */
  page: string;
  /** "Creditfactuur voor factuur {number} van {date}." */
  creditReference: string;
  /** "Creditfactuur voor factuur {number}." */
  creditReferenceNoDate: string;
  /** "Uw referentie:" (referentie of ordernummer van de klant) */
  buyerReference: string;
}

/** Nederlandse standaardteksten; de routes geven de vertaling uit messages/ mee. */
export const DEFAULT_PDF_LABELS: PdfLabels = {
  invoice: "FACTUUR",
  creditInvoice: "CREDITFACTUUR",
  number: "Nr.",
  date: "Datum:",
  due: "Vervalt:",
  deliveryDate: "Leverdatum:",
  deliveryPeriod: "Periode:",
  periodRange: "{start} t/m {end}",
  recipient: "Factuur aan:",
  vatNumber: "Btw-nummer:",
  kvkNumber: "KvK-nummer:",
  description: "Omschrijving",
  quantity: "Aantal",
  unitPrice: "Stuk",
  vat: "Btw",
  lineTotal: "Totaal",
  subtotal: "Subtotaal",
  vatOver: "Btw {rate}% over {base}",
  vatReverseOver: "Btw verlegd over {base}",
  country: "Land:",
  vatTotal: "Totaal btw",
  total: "Totaal",
  notes: "Opmerkingen:",
  paymentDetails: "Betaalgegevens:",
  scanToPay: "Scan & betaal met je bank-app",
  page: "pagina {page} van {pages}",
  creditReference: "Creditfactuur voor factuur {number} van {date}.",
  creditReferenceNoDate: "Creditfactuur voor factuur {number}.",
  buyerReference: "Uw referentie:",
};

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  /** Datum van levering of dienst, of begin van de periode (leeg = factuurdatum). */
  deliveryDate?: Date | null;
  /** Einde van de leverings- of dienstperiode. */
  deliveryEndDate?: Date | null;
  currency: string;
  company: {
    name: string;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    vatNumber?: string | null;
    kvkNumber?: string | null;
  };
  customer: {
    name: string;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    /** Landcode; alleen getoond als het niet NL is. */
    country?: string | null;
    /** Btw-nummer van de afnemer (verplicht bij btw verlegd en ICL, art. 35a Wet OB). */
    vatNumber?: string | null;
  };
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    lineTotal: number;
  }[];
  subtotal: number;
  vatAmount: number;
  total: number;
  notes?: string | null;
  /** Creditfactuur: kop "CREDITFACTUUR" in plaats van "FACTUUR". */
  isCredit?: boolean;
  /** Creditfactuur: vaste verwijzing naar de originele factuur. */
  creditReference?: { number: string; date?: Date | null } | null;
  /** Referentie of inkoopordernummer van de klant (leeg = niet tonen). */
  buyerReference?: string | null;
  /** Vaste vermeldingen boven de opmerkingen (bijv. de KOR-zin). Nooit afgekapt. */
  notices?: string[];
  /** Btw verlegd: de btw-regel in de totalen heet "Btw verlegd over ..." in plaats van "Btw 0%". */
  reverseCharge?: boolean;
  /** Huisstijl-accentkleur als hex (bijv. "#4f46e5"). */
  accentColor?: string | null;
  /** Betaalinstructies (IBAN etc.) onderaan de factuur. */
  paymentTerms?: string | null;
  /** Voettekst (bijv. KvK/algemene voorwaarden), op elke pagina. */
  footerText?: string | null;
  /** Eigen logo als base64 data-URL (PNG/JPG), linksboven op het document. */
  logo?: string | null;
  /** Documenttype-label rechtsboven (default "FACTUUR", bijv. "OFFERTE"). */
  documentLabel?: string;
  /** Label bij de ontvanger (default "Factuur aan:"). */
  recipientLabel?: string;
  /** Label bij de tweede datum (default "Vervalt:", bijv. "Geldig tot:"). */
  dueLabel?: string;
  /** EPC-QR payload ("scan en betaal", zie lib/iban.ts). Alleen facturen. */
  paymentQr?: string | null;
  /** Vertaalde teksten; ontbrekende vallen terug op het Nederlands. */
  labels?: Partial<PdfLabels>;
}

// Zet een hexkleur (#rrggbb) om naar pdf-lib rgb (0-1 floats).
function hexToRgb(hex: string | null | undefined) {
  const fallback = rgb(0.486, 0.227, 0.929); // logo-paars #7c3aed
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Vult {naam}-plekken in een tekst. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

// Pagina-indeling (A4 in punten).
const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 50;
const RIGHT = 545;
const CONTENT_W = RIGHT - LEFT;
const LINE = 12.5; // regelafstand van 10pt-tekst
// Kolommen van de regeltabel: omschrijving links, getallen rechts uitgelijnd.
const COL = { qtyRight: 362, unitRight: 432, vatRight: 472, totalRight: RIGHT };
const DESC_W = 255;
const QR_SIZE = 92;
/** Zoveel regels voettekst staan onderaan elke pagina; de rest komt aan het eind. */
export const FOOTER_MAX_LINES = 4;

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const L: PdfLabels = { ...DEFAULT_PDF_LABELS, ...stripEmpty(data.labels) };
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const accent = hexToRgb(data.accentColor); // huisstijlkleur

  const money = (n: number) => `${data.currency} ${n.toFixed(2)}`;
  const date = (d: Date) => d.toISOString().slice(0, 10);
  const label = data.documentLabel ?? (data.isCredit ? L.creditInvoice : L.invoice);

  // Voettekst: de eerste 4 regels onderaan elke pagina (bepaalt hoe laag de
  // inhoud mag). Is hij langer, dan komt de rest als laatste stuk na de
  // betaalgegevens, zodat er niets verdwijnt.
  const footerAll = wrapPdfText(data.footerText, font, 8, CONTENT_W);
  const footerLines = footerAll.slice(0, FOOTER_MAX_LINES);
  const footerRest = footerAll.slice(FOOTER_MAX_LINES);
  const footerLineY = footerLines.length ? 32 + footerLines.length * 10 : 0;
  const bottom = (footerLines.length ? footerLineY : 30) + 22;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = 792;

  type TextOpts = { size?: number; bold?: boolean; color?: RGB; align?: "left" | "right" };
  const draw = (s: string, x: number, yy: number, opts: TextOpts = {}) => {
    const f: PDFFont = opts.bold ? bold : font;
    const size = opts.size ?? 10;
    const safe = pdfSafeText(s, f);
    if (!safe) return;
    const xx = opts.align === "right" ? x - f.widthOfTextAtSize(safe, size) : x;
    page.drawText(safe, { x: xx, y: yy, size, font: f, color: opts.color ?? black });
  };
  const accentBar = () => page.drawRectangle({ x: 0, y: PAGE_H - 10, width: PAGE_W, height: 10, color: accent });
  const rule = (x1: number, x2: number, yy: number, color: RGB = gray) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.5, color });

  const tableHeader = () => {
    draw(L.description, LEFT, y, { bold: true });
    draw(L.quantity, COL.qtyRight, y, { bold: true, align: "right" });
    draw(L.unitPrice, COL.unitRight, y, { bold: true, align: "right" });
    draw(L.vat, COL.vatRight, y, { bold: true, align: "right" });
    draw(L.lineTotal, COL.totalRight, y, { bold: true, align: "right" });
    rule(LEFT, RIGHT, y - 6);
    y -= 20;
  };

  // Vervolgpagina: korte kop (bedrijf, documentsoort en nummer) en zo nodig de kolomkoppen.
  const newPage = (withTableHeader: boolean) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    accentBar();
    y = 800;
    const right = `${label} ${L.number} ${data.invoiceNumber}`;
    const rightW = bold.widthOfTextAtSize(pdfSafeText(right, bold), 12);
    draw(fitPdfText(data.company.name, bold, 12, Math.max(60, CONTENT_W - rightW - 16)), LEFT, y, { size: 12, bold: true, color: accent });
    draw(right, RIGHT, y, { size: 12, bold: true, color: accent, align: "right" });
    rule(LEFT, RIGHT, y - 10, accent);
    y -= 36;
    if (withTableHeader) tableHeader();
  };
  const ensure = (needed: number, withTableHeader = false) => {
    if (y - needed < bottom) newPage(withTableHeader);
  };

  // ---- Kop van de eerste pagina ----
  accentBar();

  // Rechterblok: documentsoort, nummer en data (rechts uitgelijnd).
  const rightLines: string[] = [`${L.number} ${data.invoiceNumber}`, `${L.date} ${date(data.issueDate)}`];
  if (data.dueDate) rightLines.push(`${data.dueLabel ?? L.due} ${date(data.dueDate)}`);
  if (data.deliveryDate) {
    const end = data.deliveryEndDate && date(data.deliveryEndDate) !== date(data.deliveryDate) ? data.deliveryEndDate : null;
    rightLines.push(end
      ? `${L.deliveryPeriod} ${fillTemplate(L.periodRange, { start: date(data.deliveryDate), end: date(end) })}`
      : `${L.deliveryDate} ${date(data.deliveryDate)}`);
  }
  if (data.buyerReference?.trim()) rightLines.push(`${L.buyerReference} ${data.buyerReference.trim()}`);
  const rightWidth = Math.max(
    bold.widthOfTextAtSize(pdfSafeText(label, bold), 18),
    ...rightLines.map((line) => font.widthOfTextAtSize(pdfSafeText(line, font), 10)),
  );
  const rightLeft = RIGHT - Math.min(rightWidth, 260);

  // Eigen logo (PNG/JPG) linksboven, indien aanwezig — schuift de bedrijfsregels op.
  let nameX = LEFT;
  if (data.logo) {
    try {
      const base64 = data.logo.split(",").pop() ?? "";
      const bytes = Buffer.from(base64, "base64");
      const img = /image\/png/i.test(data.logo) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const h = 42;
      const w = Math.min(150, (img.width / img.height) * h);
      page.drawImage(img, { x: LEFT, y: y - 24, width: w, height: h });
      nameX = LEFT + w + 12;
    } catch {
      /* ongeldig logo -> overslaan */
    }
  }
  const leftWidth = Math.max(80, rightLeft - nameX - 14);

  // Bedrijfsnaam (verplicht factuurgegeven, art. 35a Wet OB): zo groot als past
  // (18 -> 11pt); past hij dan nog niet, dan over meerdere regels. Nooit afgekapt.
  let nameSize = 18;
  while (nameSize > 11 && bold.widthOfTextAtSize(pdfSafeText(data.company.name, bold), nameSize) > leftWidth) nameSize -= 1;
  const nameLines = wrapPdfText(data.company.name, bold, nameSize, leftWidth);
  nameLines.forEach((part, i) => draw(part, nameX, y - i * (nameSize + 3), { size: nameSize, bold: true, color: accent }));
  draw(label, RIGHT, y, { size: 18, bold: true, color: accent, align: "right" });

  const companyLines: string[] = [];
  if (data.company.address) companyLines.push(data.company.address);
  const cityLine = [data.company.postalCode, data.company.city].filter(Boolean).join(" ");
  if (cityLine) companyLines.push(cityLine);
  if (data.company.vatNumber) companyLines.push(`${L.vatNumber} ${data.company.vatNumber}`);
  if (data.company.kvkNumber) companyLines.push(`${L.kvkNumber} ${data.company.kvkNumber}`);
  let leftY = y - 18 - Math.max(0, nameLines.length - 1) * (nameSize + 3);
  for (const line of companyLines) {
    for (const part of wrapPdfText(line, font, 10, leftWidth)) {
      draw(part, nameX, leftY, { color: gray });
      leftY -= 14;
    }
  }
  let rightY = y - 18;
  for (const line of rightLines) {
    draw(line, RIGHT, rightY, { color: gray, align: "right" });
    rightY -= 14;
  }
  y = Math.min(leftY, rightY, data.logo ? y - 30 : y) - 26;

  // Klant
  draw(data.recipientLabel ?? L.recipient, LEFT, y, { bold: true });
  y -= 14;
  for (const part of wrapPdfText(data.customer.name, font, 10, 300)) {
    draw(part, LEFT, y);
    y -= 13;
  }
  const customerCountry = data.customer.country?.trim().toUpperCase();
  const customerLines = [
    data.customer.address,
    [data.customer.postalCode, data.customer.city].filter(Boolean).join(" "),
    customerCountry && customerCountry !== "NL" ? `${L.country} ${customerCountry}` : null,
    data.customer.vatNumber ? `${L.vatNumber} ${data.customer.vatNumber}` : null,
  ];
  for (const line of customerLines) {
    for (const part of wrapPdfText(line, font, 10, 300)) {
      draw(part, LEFT, y, { color: gray });
      y -= 13;
    }
  }

  // Creditfactuur: vaste verwijzing naar de originele factuur (niet via de opmerkingen).
  if (data.creditReference?.number) {
    const ref = data.creditReference.date
      ? fillTemplate(L.creditReference, { number: data.creditReference.number, date: date(data.creditReference.date) })
      : fillTemplate(L.creditReferenceNoDate, { number: data.creditReference.number });
    y -= 10;
    for (const part of wrapPdfText(ref, bold, 10, CONTENT_W)) {
      draw(part, LEFT, y, { bold: true });
      y -= LINE;
    }
  }

  // ---- Regels ----
  y -= 22;
  ensure(60, false);
  tableHeader();
  for (const item of data.lineItems) {
    const lines = wrapPdfText(item.description, font, 10, DESC_W);
    if (lines.length === 0) lines.push("");
    // Past de hele regel niet meer, dan naar de volgende pagina (als hij daar wél past).
    const rowHeight = lines.length * LINE;
    if (y - rowHeight < bottom && rowHeight <= 800 - 56 - bottom) newPage(true);
    lines.forEach((part, i) => {
      if (y - LINE < bottom - LINE) newPage(true); // extreem lange omschrijving
      draw(part, LEFT, y);
      if (i === 0) {
        draw(formatQuantity(item.quantity), COL.qtyRight, y, { align: "right" });
        draw(item.unitPrice.toFixed(2), COL.unitRight, y, { align: "right" });
        draw(`${item.vatRate}%`, COL.vatRight, y, { align: "right" });
        draw(item.lineTotal.toFixed(2), COL.totalRight, y, { align: "right" });
      }
      y -= LINE;
    });
    y -= 4;
  }

  // ---- Totalen, met btw per tarief (art. 35a Wet OB) ----
  const groups = vatBreakdown(data.lineItems);
  const groupVat = groups.reduce((sum, g) => sum + Math.round(g.vat * 100), 0);
  const showVatTotal = groups.length !== 1 || groupVat !== Math.round(data.vatAmount * 100);
  const totalRows = 1 + groups.length + (showVatTotal ? 1 : 0);
  const totalsHeight = 12 + totalRows * 15 + 18;
  const qrBlock = data.paymentQr ? QR_SIZE + 16 : 0;
  y -= 6;
  ensure(Math.max(totalsHeight, qrBlock) + 4);

  const totalsTop = y;
  rule(300, RIGHT, y);
  y -= 16;
  const totalRow = (left: string, value: string, opts: TextOpts = {}) => {
    draw(left, 300, y, opts);
    draw(value, RIGHT, y, { ...opts, align: "right" });
  };
  totalRow(L.subtotal, money(data.subtotal));
  for (const g of groups) {
    y -= 15;
    const vatLabel = data.reverseCharge && g.rate === 0
      ? fillTemplate(L.vatReverseOver, { base: money(g.base) })
      : fillTemplate(L.vatOver, { rate: formatRate(g.rate), base: money(g.base) });
    totalRow(vatLabel, money(g.vat));
  }
  if (showVatTotal) {
    y -= 15;
    totalRow(L.vatTotal, money(data.vatAmount));
  }
  y -= 18;
  totalRow(L.total, money(data.total), { bold: true, color: accent });
  let blockBottom = y;

  // Scan-en-betaal-QR links naast de totalen (zelfde pagina, dus nooit over de tekst heen).
  if (data.paymentQr) {
    try {
      const png = await QRCode.toBuffer(data.paymentQr, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 360 });
      const img = await doc.embedPng(png);
      const qrTop = totalsTop - 2;
      page.drawImage(img, { x: LEFT, y: qrTop - QR_SIZE, width: QR_SIZE, height: QR_SIZE });
      draw(L.scanToPay, LEFT, qrTop - QR_SIZE - 11, { size: 7, color: gray });
      blockBottom = Math.min(blockBottom, qrTop - QR_SIZE - 11);
    } catch {
      /* QR mislukt -> factuur blijft geldig zonder QR */
    }
  }
  y = blockBottom - 28;

  // ---- Vaste vermeldingen, opmerkingen en betaalgegevens: volledig, over pagina's ----
  const paragraph = (lines: string[], opts: TextOpts) => {
    for (const part of lines) {
      ensure(LINE);
      if (part) draw(part, LEFT, y, opts);
      y -= LINE;
    }
  };
  const section = (heading: string | null, lines: string[], opts: TextOpts) => {
    if (lines.length === 0) return;
    // Kop en de eerste regels blijven bij elkaar.
    ensure((heading ? 14 : 0) + LINE * Math.min(lines.length, 2));
    if (heading) {
      draw(heading, LEFT, y, { bold: true });
      y -= 14;
    }
    paragraph(lines, opts);
    y -= 16;
  };
  for (const notice of data.notices ?? []) section(null, wrapPdfText(notice, font, 10, CONTENT_W), { color: black });
  section(L.notes, wrapPdfText(data.notes, font, 10, CONTENT_W), { color: gray });
  section(L.paymentDetails, wrapPdfText(data.paymentTerms, font, 10, CONTENT_W), { color: gray });
  // Rest van een lange voettekst (8pt, zelfde opmaak als onderaan de pagina).
  if (footerRest.length) {
    ensure(10 * Math.min(footerRest.length, 2));
    for (const part of footerRest) {
      ensure(10);
      if (part) draw(part, LEFT, y, { size: 8, color: gray });
      y -= 10;
    }
  }

  // ---- Voettekst en paginanummers op elke pagina ----
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    if (footerLines.length) {
      rule(LEFT, RIGHT, footerLineY, accent);
      footerLines.forEach((line, n) => draw(line, LEFT, footerLineY - 12 - n * 10, { size: 8, color: gray }));
    }
    draw(fillTemplate(L.page, { page: i + 1, pages: pages.length }), RIGHT, 20, { size: 8, color: gray, align: "right" });
  });

  return doc.save();
}

function stripEmpty(labels: Partial<PdfLabels> | undefined): Partial<PdfLabels> {
  const out: Partial<PdfLabels> = {};
  for (const [key, value] of Object.entries(labels ?? {})) {
    if (typeof value === "string" && value.trim()) out[key as keyof PdfLabels] = value;
  }
  return out;
}

/** 3.5 -> "3.5", 2 -> "2", 1.25 -> "1.25" (geen zwevende-komma-ruis). */
function formatQuantity(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "";
}

function formatRate(n: number): string {
  return String(Math.round(n * 100) / 100);
}
