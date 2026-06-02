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

  // Header
  text(data.company.name, margin, y, { size: 18, bold: true });
  text("FACTUUR", 420, y, { size: 18, bold: true });
  y -= 18;
  if (data.company.address) text(data.company.address, margin, y, { color: gray });
  text(`Nr. ${data.invoiceNumber}`, 420, y, { color: gray });
  y -= 14;
  const cityLine = [data.company.postalCode, data.company.city].filter(Boolean).join(" ");
  if (cityLine) text(cityLine, margin, y, { color: gray });
  text(`Datum: ${date(data.issueDate)}`, 420, y, { color: gray });
  y -= 14;
  if (data.company.vatNumber) text(`BTW: ${data.company.vatNumber}`, margin, y, { color: gray });
  if (data.dueDate) text(`Vervalt: ${date(data.dueDate)}`, 420, y, { color: gray });

  // Klant
  y -= 40;
  text("Factuur aan:", margin, y, { bold: true });
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
  text("Totaal", 380, y, { bold: true });
  text(money(data.total), 480, y, { bold: true });

  // Notities
  if (data.notes) {
    y -= 40;
    text("Opmerkingen:", margin, y, { bold: true });
    y -= 14;
    text(data.notes.slice(0, 90), margin, y, { color: gray });
  }

  return doc.save();
}
