import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream, type PDFPage } from "pdf-lib";
import { DEFAULT_PDF_LABELS, generateInvoicePdf, type InvoicePdfData } from "@/lib/pdf";
import { pdfSafeText, removeFixedSentences, wrapPdfText } from "@/lib/pdf-text";
import { creditNoteTexts, korNoticeTexts, pdfTexts } from "@/lib/pdf-labels";
import { vatBreakdown } from "@/lib/vat-breakdown";
import { isCreditInvoice, originalNumberFromAuditTarget, resolveCreditReference, type CreditLookupDb } from "@/lib/credit-reference";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { deflateSync } from "node:zlib";

// ---- Hulpjes: tekst per pagina uit de PDF halen ----
function pageStreams(page: PDFPage): PDFRawStream[] {
  const contents = page.node.Contents();
  if (!contents) return [];
  if (contents instanceof PDFArray) {
    return contents.asArray().map((ref) => page.doc.context.lookup(ref)).filter((s): s is PDFRawStream => s instanceof PDFRawStream);
  }
  return contents instanceof PDFRawStream ? [contents] : [];
}

async function pdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const parts: string[] = [];
    for (const stream of pageStreams(page)) {
      const ops = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      for (const m of ops.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) parts.push(Buffer.from(m[1], "hex").toString("latin1"));
    }
    return parts.join(" ").replace(/\s+/g, " ");
  });
}

function invoice(overrides: Partial<InvoicePdfData> = {}): InvoicePdfData {
  const totals = calculateInvoiceTotals([{ description: "Werk", quantity: 1, unitPrice: 100, vatRate: 21 }]);
  return {
    invoiceNumber: "2026-0042", issueDate: new Date("2026-11-05T12:00:00Z"), dueDate: new Date("2026-11-19T12:00:00Z"), currency: "EUR",
    company: { name: "Jansen Advies", address: "Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht", vatNumber: "NL001234567B01", kvkNumber: "12345678" },
    customer: { name: "Klant BV", address: "Kade 2", postalCode: "1000 AA", city: "Amsterdam" },
    lineItems: totals.lineItems.map((li) => ({ ...li })),
    subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total,
    ...overrides,
  };
}

function manyLines(count: number) {
  const totals = calculateInvoiceTotals(Array.from({ length: count }, (_, i) => ({
    description: `Urenregel ${i + 1} werkzaamheden project`, quantity: 1.5, unitPrice: 80, vatRate: i % 2 ? 9 : 21,
  })));
  return { lineItems: totals.lineItems.map((li) => ({ ...li })), subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total };
}

describe("factuur-PDF: meerdere pagina's (nr 11)", () => {
  it("zet 200 regels over meerdere pagina's met alle regels, kop, totaal en paginanummers", async () => {
    const data = invoice(manyLines(200));
    const pages = await pdfPageTexts(await generateInvoicePdf(data));
    expect(pages.length).toBeGreaterThan(4);
    const all = pages.join(" ");
    for (let i = 1; i <= 200; i++) {
      expect(all.match(new RegExp(`Urenregel ${i} werkzaamheden`, "g"))?.length, `regel ${i}`).toBe(1);
    }
    pages.forEach((text, i) => {
      expect(text).toContain(`pagina ${i + 1} van ${pages.length}`);
      expect(text).toContain("2026-0042");
    });
    // Kolomkoppen herhaald op elke pagina met regels; totaal alleen op de laatste pagina.
    expect(pages.filter((text) => text.includes("Omschrijving")).length).toBeGreaterThanOrEqual(pages.length - 1);
    const last = pages[pages.length - 1];
    expect(last).toContain(`Totaal EUR ${data.total.toFixed(2)}`);
    expect(pages.slice(0, -1).some((text) => text.includes(`EUR ${data.total.toFixed(2)}`))).toBe(false);
  });

  it("één korte factuur blijft één pagina", async () => {
    const pages = await pdfPageTexts(await generateInvoicePdf(invoice()));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("pagina 1 van 1");
  });

  it("offertes gebruiken dezelfde opmaak met eigen kop", async () => {
    const t = pdfTexts("nl");
    const pages = await pdfPageTexts(await generateInvoicePdf(invoice({ ...manyLines(60), documentLabel: t.quote.title, recipientLabel: t.quote.recipient, dueLabel: t.quote.validUntil })));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toContain("OFFERTE");
    expect(pages[0]).toContain("Offerte voor:");
    expect(pages[0]).toContain("Geldig tot: 2026-11-19");
  });
});

describe("factuur-PDF: tekens buiten WinAnsi (nr 37)", () => {
  it("vervangt onbekende tekens veilig en laat bekende staan", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(pdfSafeText("Łódź", font)).toBe("Lódz");
    expect(pdfSafeText("Győr Ştefan Çelik", font)).toBe("Gyor Stefan Çelik");
    expect(pdfSafeText("Paweł Wiśniewski", font)).toBe("Pawel Wisniewski");
    expect(pdfSafeText("Café Müller – “goed” €", font)).toBe("Café Müller – “goed” €");
    expect(pdfSafeText("Klaar 👍🏽!", font)).toBe("Klaar ?!");
    // Een samengestelde emoji (gezin met ZWJ, vlag, huidskleur) wordt precies één "?".
    expect(pdfSafeText("Gezin 👨‍👩‍👧", font)).toBe("Gezin ?");
    expect(pdfSafeText("Vlag 🇳🇱 en 🇧🇪", font)).toBe("Vlag ? en ?");
    expect(pdfSafeText("Top 👍🏽👍", font)).toBe("Top ??");
    expect(pdfSafeText("Hart ❤️!", font)).toBe("Hart ?!");
    // Een los accentteken op een gewone letter valt weg; de letter blijft.
    expect(pdfSafeText("q̃ en ä", font)).toBe("q en ä");
    expect(pdfSafeText("zacht­e​breuk", font)).toBe("zachtebreuk");
    expect(pdfSafeText("a\tb\r\nc\u0007", font)).toBe("a b c");
    expect(pdfSafeText("中文", font)).toBe("??");
  });

  it("maakt een PDF met Poolse, Hongaarse, Turkse, Roemeense namen en emoji", async () => {
    const data = invoice({
      company: { name: "Wiśniewski Łukasz 🚀", address: "Ulica Świętego 3", city: "Łódź", kvkNumber: "12345678" },
      customer: { name: "Şahin Öztürk Kft. – Győr", address: "Strada Ţepeş 1", city: "Iaşi" },
      lineItems: [{ description: "Ontwerp ✨ logo 👍 en ﬁnale ǅ check", quantity: 1, unitPrice: 100, vatRate: 21, lineTotal: 100 }],
      notes: "Dziękuję! 🙏\nKöszönöm.",
      footerText: "Algemene voorwaarden ⚖️ op aanvraag",
      paymentTerms: "IBAN NL91 ABNA 0417 1643 00 t.n.v. Wiśniewski",
    });
    const bytes = await generateInvoicePdf(data);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const [text] = await pdfPageTexts(bytes);
    expect(text).toContain("Wisniewski Lukasz ?");
    expect(text).toContain("Sahin Öztürk Kft. ");
    expect(text).toContain("Lódz");
  });
});

describe("factuur-PDF: btw per tarief en leverdatum (nr 43)", () => {
  it("groepeert grondslag en btw per tarief zoals de factuur rekent", () => {
    const totals = calculateInvoiceTotals([
      { description: "A", quantity: 3.5, unitPrice: 85.55, vatRate: 21 },
      { description: "B", quantity: 1, unitPrice: 19.99, vatRate: 9 },
      { description: "C", quantity: 1, unitPrice: 0.05, vatRate: 21 },
    ]);
    const groups = vatBreakdown(totals.lineItems);
    expect(groups.map((g) => g.rate)).toEqual([21, 9]);
    expect(groups[0].base).toBe(299.48);
    expect(groups[1]).toEqual({ rate: 9, base: 19.99, vat: 1.8 });
    expect(Math.round(groups.reduce((s, g) => s + g.vat, 0) * 100)).toBe(Math.round(totals.vatAmount * 100));
  });

  it("toont 'Btw 21% over X' en 'Btw 9% over Y' plus het totaal btw", async () => {
    const totals = calculateInvoiceTotals([
      { description: "Advies", quantity: 1, unitPrice: 100, vatRate: 21 },
      { description: "Boek", quantity: 1, unitPrice: 50, vatRate: 9 },
    ]);
    const [text] = await pdfPageTexts(await generateInvoicePdf(invoice({ lineItems: totals.lineItems, subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total })));
    expect(text).toContain("Btw 21% over EUR 100.00 EUR 21.00");
    expect(text).toContain("Btw 9% over EUR 50.00 EUR 4.50");
    expect(text).toContain("Totaal btw EUR 25.50");
    expect(text).toContain("Totaal EUR 175.50");
  });

  it("drukt de leverdatum of de periode af", async () => {
    const [single] = await pdfPageTexts(await generateInvoicePdf(invoice({ deliveryDate: new Date("2026-10-15T00:00:00Z") })));
    expect(single).toContain("Leverdatum: 2026-10-15");
    const [period] = await pdfPageTexts(await generateInvoicePdf(invoice({ deliveryDate: new Date("2026-10-01T00:00:00Z"), deliveryEndDate: new Date("2026-10-31T00:00:00Z") })));
    expect(period).toContain("Periode: 2026-10-01 t/m 2026-10-31");
    const [none] = await pdfPageTexts(await generateInvoicePdf(invoice()));
    expect(none).not.toContain("Leverdatum");
    expect(none).not.toContain("Periode");
  });
});

describe("factuur-PDF: KvK-nummer (nr 46)", () => {
  it("staat onder het btw-nummer", async () => {
    const [text] = await pdfPageTexts(await generateInvoicePdf(invoice()));
    expect(text).toContain("Btw-nummer: NL001234567B01 KvK-nummer: 12345678");
  });
});

describe("factuur-PDF: niets afkappen (nr 47)", () => {
  it("breekt een omschrijving van 500 tekens af over regels zonder iets weg te laten", async () => {
    const words = Array.from({ length: 70 }, (_, i) => `woord${i}`);
    const description = words.join(" ").slice(0, 500);
    const [text] = await pdfPageTexts(await generateInvoicePdf(invoice({ lineItems: [{ description, quantity: 1, unitPrice: 100, vatRate: 21, lineTotal: 100 }] })));
    // De bedragen staan naast de eerste regel van de omschrijving.
    expect(text.replace(" 1 100.00 21% 100.00", "")).toContain(description);
  });

  it("toont de KOR-zin als vast onderdeel, ook met QR-code en lange opmerkingen", async () => {
    const kor = korNoticeTexts()[0];
    const notes = `${"Dank voor de prettige samenwerking dit jaar. ".repeat(8).trim()}\nTweede alinea met meer uitleg.`;
    const [text] = await pdfPageTexts(await generateInvoicePdf(invoice({
      lineItems: [{ description: "Werk", quantity: 1, unitPrice: 100, vatRate: 0, lineTotal: 100 }], subtotal: 100, vatAmount: 0, total: 100,
      notices: [kor], notes, paymentQr: "BCD\n002\n1\nSCT\n\nJansen\nNL91ABNA0417164300\nEUR100.00\n\n\nFactuur 2026-0042",
      paymentTerms: "Graag binnen 14 dagen op IBAN NL91 ABNA 0417 1643 00\nt.n.v. Jansen Advies\nonder vermelding van het factuurnummer\nVragen? Bel 030-1234567",
    })));
    expect(text).toContain(kor);
    expect(text).toContain(notes.replace(/\n/g, " "));
    expect(text).toContain("Vragen? Bel 030-1234567");
    expect(text).toContain("Scan & betaal met je bank-app");
  });

  it("wrapPdfText houdt alle tekst en breekt te lange woorden", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const url = `https://example.nl/${"x".repeat(200)}`;
    const lines = wrapPdfText(`kort\n\n\n${url}`, font, 10, 100);
    expect(lines[0]).toBe("kort");
    expect(lines[1]).toBe("");
    expect(lines.slice(2).join("")).toBe(url);
    expect(lines.every((line) => font.widthOfTextAtSize(line, 10) <= 100)).toBe(true);
  });

  it("haalt vaste zinnen uit de opmerkingen zodat ze er niet dubbel staan", () => {
    const kor = korNoticeTexts()[0];
    expect(removeFixedSentences(`Bedankt!\n\n${kor}`, [kor])).toBe("Bedankt!");
    expect(removeFixedSentences(kor, korNoticeTexts())).toBeNull();
    const credit = creditNoteTexts("2026-0007")[0];
    expect(credit).toBe("Creditfactuur voor factuur 2026-0007.");
    expect(removeFixedSentences(`${credit}\n\nOude opmerking`, creditNoteTexts("2026-0007"))).toBe("Oude opmerking");
    expect(removeFixedSentences(null, [kor])).toBeNull();
  });
});

describe("creditfactuur-PDF (nr 48)", () => {
  it("heet CREDITFACTUUR en verwijst vast naar de originele factuur met datum", async () => {
    const totals = calculateInvoiceTotals([{ description: "Werk", quantity: -1, unitPrice: 100, vatRate: 21 }]);
    const [text] = await pdfPageTexts(await generateInvoicePdf(invoice({
      invoiceNumber: "2026-0050", dueDate: null, isCredit: true,
      creditReference: { number: "2026-0007", date: new Date("2026-10-01T12:00:00Z") },
      lineItems: totals.lineItems, subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total,
    })));
    expect(text).toContain("CREDITFACTUUR");
    expect(text).not.toMatch(/(^|[^T])FACTUUR/);
    expect(text).toContain("Creditfactuur voor factuur 2026-0007 van 2026-10-01.");
    expect(text).toContain("Totaal EUR -121.00");
  });

  it("herkent een creditfactuur en vindt bij oude creditfacturen het origineel via het logboek", async () => {
    expect(isCreditInvoice({ total: -10 })).toBe(true);
    expect(isCreditInvoice({ total: 0, originalInvoiceNumber: "2026-0001" })).toBe(true);
    expect(isCreditInvoice({ total: 10 })).toBe(false);
    expect(originalNumberFromAuditTarget("2026-0007 → 2026-0050", "2026-0050")).toBe("2026-0007");
    expect(originalNumberFromAuditTarget("2026-0007 → 2026-0051", "2026-0050")).toBeNull();
    expect(originalNumberFromAuditTarget(null, "2026-0050")).toBeNull();

    const calls: unknown[] = [];
    const fakeDb: CreditLookupDb = {
      auditLog: { findFirst: async (args) => { calls.push(args); return { target: "2026-0007 → 2026-0050" }; } },
      invoice: { findFirst: async () => ({ issueDate: new Date("2026-10-01T00:00:00Z") }) },
    };
    // Nieuw: opgeslagen verwijzing, zonder database.
    expect(await resolveCreditReference(fakeDb, "acc", { invoiceNumber: "2026-0050", total: -121, originalInvoiceNumber: "2026-0007", originalInvoiceDate: new Date("2026-10-01T00:00:00Z") }))
      .toEqual({ number: "2026-0007", date: new Date("2026-10-01T00:00:00Z") });
    expect(calls).toHaveLength(0);
    // Oud: via het logboek.
    expect(await resolveCreditReference(fakeDb, "acc", { invoiceNumber: "2026-0050", total: -121 }))
      .toEqual({ number: "2026-0007", date: new Date("2026-10-01T00:00:00Z") });
    // Gewone factuur: geen verwijzing. Database-fout: PDF blijft werken.
    expect(await resolveCreditReference(fakeDb, "acc", { invoiceNumber: "2026-0051", total: 121 })).toBeNull();
    const broken: CreditLookupDb = { ...fakeDb, auditLog: { findFirst: async () => { throw new Error("db weg"); } } };
    expect(await resolveCreditReference(broken, "acc", { invoiceNumber: "2026-0050", total: -121 })).toBeNull();
  });
});

describe("PDF-teksten in messages", () => {
  it("de Nederlandse teksten zijn de standaard en het Engels heeft dezelfde sleutels", () => {
    expect(pdfTexts("nl").labels).toEqual(DEFAULT_PDF_LABELS);
    expect(Object.keys(pdfTexts("en").labels).sort()).toEqual(Object.keys(DEFAULT_PDF_LABELS).sort());
    expect(pdfTexts("fr").labels).toEqual(DEFAULT_PDF_LABELS);
  });

  it("maakt een Engelse creditnota", async () => {
    const [text] = await pdfPageTexts(await generateInvoicePdf(invoice({ isCredit: true, creditReference: { number: "2026-0007", date: null }, labels: pdfTexts("en").labels })));
    expect(text).toContain("CREDIT NOTE");
    expect(text).toContain("Credit note for invoice 2026-0007.");
    expect(text).toContain("page 1 of 1");
  });
});

// ---- Tekst met positie per pagina (voor "boven de voettekstzone") ----
async function pdfPagePositions(bytes: Uint8Array): Promise<{ x: number; y: number; text: string }[][]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const items: { x: number; y: number; text: string }[] = [];
    for (const stream of pageStreams(page)) {
      const ops = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      for (const m of ops.matchAll(/(-?[\d.]+) (-?[\d.]+) Tm\s+<([0-9A-Fa-f]*)>\s*Tj/g)) {
        items.push({ x: Number(m[1]), y: Number(m[2]), text: Buffer.from(m[3], "hex").toString("latin1") });
      }
    }
    return items;
  });
}

// Klein, breed PNG-logo (400 x 40) zonder extra pakketten.
function widePngDataUrl(): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const w = 400, h = 40;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80);
  for (let row = 0; row < h; row++) raw[row * (w * 3 + 1)] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

describe("factuur-PDF: bedrijfsnaam nooit afgekapt (nr 47)", () => {
  it("breekt een lange naam naast een breed logo af over regels", async () => {
    const name = "Installatiebedrijf De Vries en Zonen Noord-Holland B.V.";
    const bytes = await generateInvoicePdf(invoice({ company: { ...invoice().company, name }, logo: widePngDataUrl(), isCredit: true, deliveryDate: new Date("2026-10-01T00:00:00Z"), deliveryEndDate: new Date("2026-10-31T00:00:00Z") }));
    const [items] = await pdfPagePositions(bytes);
    const [text] = await pdfPageTexts(bytes);
    expect(text).toContain(name);
    expect(text).not.toContain("...");
    // Echt over meerdere regels (het logo laat te weinig ruimte voor één regel).
    const nameParts = items.filter((it) => name.includes(it.text.trim()) && it.text.trim().length > 3 && it.x > 50);
    expect(new Set(nameParts.map((it) => it.y)).size).toBeGreaterThan(1);
    // De adresregels komen onder de laatste naamregel.
    const lowestName = Math.min(...nameParts.map((it) => it.y));
    const address = items.find((it) => it.text === "Dorpsstraat 1");
    expect(address && address.y).toBeLessThan(lowestName);
  });
});

describe("factuur-PDF: voettekst (nr 47)", () => {
  const longFooter = Array.from({ length: 40 }, (_, i) => `Voorwaarde ${i + 1}: levering en betaling volgens de algemene voorwaarden.`).join(" ").slice(0, 2000);

  it("laat niets van een lange voettekst weg: de rest staat aan het eind", async () => {
    const bytes = await generateInvoicePdf(invoice({ footerText: longFooter }));
    const all = (await pdfPageTexts(bytes)).join(" ");
    for (let i = 1; i <= 25; i++) {
      if (longFooter.includes(`Voorwaarde ${i}:`)) expect(all, `voorwaarde ${i}`).toContain(`Voorwaarde ${i}:`);
    }
    expect(all).toContain(longFooter.slice(-40).trim());
  });

  it("houdt alle inhoud boven de voettekstzone, ook bij veel regels", async () => {
    const bytes = await generateInvoicePdf(invoice({ ...manyLines(120), footerText: longFooter, notes: "Opmerking ".repeat(200), paymentTerms: "IBAN NL91 ABNA 0417 1643 00" }));
    const pages = await pdfPagePositions(bytes);
    expect(pages.length).toBeGreaterThan(2);
    // 4 regels voettekst: lijn op y=72, inhoud niet lager dan 72 + 22.
    const bottom = 32 + 4 * 10 + 22;
    pages.forEach((items, p) => {
      expect(items.length).toBeGreaterThan(10);
      for (const it of items) {
        if (it.y >= bottom) continue;
        const isPageNumber = it.y === 20 && /^pagina \d+ van \d+$/.test(it.text);
        const isFooter = it.y <= 60 && it.y >= 30 && longFooter.includes(it.text.trim());
        expect(isPageNumber || isFooter, `pagina ${p + 1}: "${it.text}" op y=${it.y}`).toBe(true);
      }
    });
    // De inhoud loopt echt tot vlak boven de voettekst (anders zegt de test niets).
    const lowest = pages.map((items) => Math.min(...items.filter((it) => it.y >= bottom).map((it) => it.y)));
    expect(lowest.filter((y) => y < bottom + 30).length).toBeGreaterThan(0);
  });
});
