import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Genereert een factuur-PDF met pdf-lib (geen headless browser nodig,
 * dus serverless-vriendelijk op Vercel). Geeft een Uint8Array terug.
 */

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
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
  /** Huisstijl-accentkleur als hex (bijv. "#4f46e5"). */
  accentColor?: string | null;
  /** Betaalinstructies (IBAN etc.) onderaan de factuur. */
  paymentTerms?: string | null;
  /** Voettekst (bijv. KvK/algemene voorwaarden). */
  footerText?: string | null;
  /** Eigen logo als base64 data-URL (PNG/JPG), linksboven op het document. */
  logo?: string | null;
  /** Documenttype-label rechtsboven (default "FACTUUR", bijv. "OFFERTE"). */
  documentLabel?: string;
  /** Label bij de ontvanger (default "Factuur aan:"). */
  recipientLabel?: string;
  /** Label bij de tweede datum (default "Vervalt:", bijv. "Geldig tot:"). */
  dueLabel?: string;
}

// Zet een hexkleur (#rrggbb) om naar pdf-lib rgb (0-1 floats).
function hexToRgb(hex: string | null | undefined) {
  const fallback = rgb(0.486, 0.227, 0.929); // logo-paars #7c3aed
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 in points
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 792;
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const accent = hexToRgb(data.accentColor); // huisstijlkleur

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(s, {
      x,
      y: yy,
      size: opts.size ?? 10,
      font: opts.bold ? bold : font,
      color: opts.color ?? black,
    });
  };

  const money = (n: number) => `${data.currency} ${n.toFixed(2)}`;
  const date = (d: Date) => d.toISOString().slice(0, 10);

  // Accent-balk bovenaan (huisstijl)
  page.drawRectangle({ x: 0, y: 832, width: 595, height: 10, color: accent });

  // Eigen logo (PNG/JPG) linksboven, indien aanwezig — schuift de bedrijfsregels op
  let nameX = margin;
  if (data.logo) {
    try {
      const base64 = data.logo.split(",").pop() ?? "";
      const bytes = Buffer.from(base64, "base64");
      const img = /image\/png/i.test(data.logo) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const h = 42;
      const w = Math.min(150, (img.width / img.height) * h);
      page.drawImage(img, { x: margin, y: y - 24, width: w, height: h });
      nameX = margin + w + 12;
    } catch {
      /* ongeldig logo -> overslaan */
    }
  }

  // Header
  text(data.company.name, nameX, y, { size: 18, bold: true, color: accent });
  text(data.documentLabel ?? "FACTUUR", 420, y, { size: 18, bold: true, color: accent });
  y -= 18;
  if (data.company.address) text(data.company.address, nameX, y, { color: gray });
  text(`Nr. ${data.invoiceNumber}`, 420, y, { color: gray });
  y -= 14;
  const cityLine = [data.company.postalCode, data.company.city].filter(Boolean).join(" ");
  if (cityLine) text(cityLine, nameX, y, { color: gray });
  text(`Datum: ${date(data.issueDate)}`, 420, y, { color: gray });
  y -= 14;
  if (data.company.vatNumber) text(`BTW: ${data.company.vatNumber}`, nameX, y, { color: gray });
  if (data.dueDate) text(`${data.dueLabel ?? "Vervalt:"} ${date(data.dueDate)}`, 420, y, { color: gray });

  // Klant
  y -= 40;
  text(data.recipientLabel ?? "Factuur aan:", margin, y, { bold: true });
  y -= 14;
  text(data.customer.name, margin, y);
  if (data.customer.address) {
    y -= 13;
    text(data.customer.address, margin, y, { color: gray });
  }
  const custCity = [data.customer.postalCode, data.customer.city].filter(Boolean).join(" ");
  if (custCity) {
    y -= 13;
    text(custCity, margin, y, { color: gray });
  }

  // Tabel-header
  y -= 36;
  text("Omschrijving", margin, y, { bold: true });
  text("Aantal", 320, y, { bold: true });
  text("Stuk", 380, y, { bold: true });
  text("BTW", 440, y, { bold: true });
  text("Totaal", 500, y, { bold: true });
  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 545, y },
    thickness: 0.5,
    color: gray,
  });
  y -= 16;

  // Regels
  for (const item of data.lineItems) {
    text(item.description.slice(0, 45), margin, y);
    text(String(item.quantity), 320, y);
    text(item.unitPrice.toFixed(2), 380, y);
    text(`${item.vatRate}%`, 440, y);
    text(item.lineTotal.toFixed(2), 500, y);
    y -= 16;
  }

  // Totalen
  y -= 10;
  page.drawLine({
    start: { x: 360, y },
    end: { x: 545, y },
    thickness: 0.5,
    color: gray,
  });
  y -= 16;
  text("Subtotaal", 380, y);
  text(money(data.subtotal), 480, y);
  y -= 14;
  text("BTW", 380, y);
  text(money(data.vatAmount), 480, y);
  y -= 16;
  text("Totaal", 380, y, { bold: true, color: accent });
  text(money(data.total), 480, y, { bold: true, color: accent });

  // Notities
  if (data.notes) {
    y -= 40;
    text("Opmerkingen:", margin, y, { bold: true });
    y -= 14;
    text(data.notes.slice(0, 90), margin, y, { color: gray });
  }

  // Betaalinstructies
  if (data.paymentTerms) {
    y -= 30;
    text("Betaalgegevens:", margin, y, { bold: true });
    y -= 14;
    for (const line of data.paymentTerms.split("\n").slice(0, 3)) {
      text(line.slice(0, 90), margin, y, { color: gray });
      y -= 13;
    }
  }

  // Voettekst onderaan de pagina
  if (data.footerText) {
    page.drawLine({ start: { x: margin, y: 60 }, end: { x: 545, y: 60 }, thickness: 0.5, color: accent });
    text(data.footerText.slice(0, 110), margin, 46, { size: 8, color: gray });
  }

  return doc.save();
}
