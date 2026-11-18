import { describe, expect, it } from "vitest";
import { renderEmail, renderKlantEmail, senderName } from "@/lib/email-templates";
import { verifiedDocumentDataUrl } from "@/lib/document-file";
import { createExpenseSchema } from "@/lib/validations/expense";

describe("senderName", () => {
  it("nooit Saldova als bedrijfsnaam", () => {
    expect(senderName({ companyName: "Bakkerij Jansen", userName: "Piet", email: "p@x.nl" })).toBe("Bakkerij Jansen");
    expect(senderName({ companyName: null, userName: "Piet Jansen", email: "p@x.nl" })).toBe("Piet Jansen");
    expect(senderName({ companyName: " ", userName: null, email: "p@x.nl" })).toBe("p@x.nl");
    expect(senderName({ companyName: "Saldova", userName: null, email: "p@x.nl" })).toBe("p@x.nl");
  });
});

describe("renderKlantEmail", () => {
  it("bedrijf bovenaan, neutrale opmaak en klein 'Verstuurd via'", () => {
    const html = renderKlantEmail({ companyName: "Jansen & Zn <b>", heading: "Factuur 2026-0001", bodyHtml: "<p>Hallo</p>" });
    expect(html).toContain("Jansen &amp; Zn &lt;b&gt;");
    expect(html).toContain("Verstuurd via");
    expect(html).toContain(">SALD</span>OVA");
    expect(html).not.toContain("saldova-ei-96.png");
  });
  it("toont alleen een veilig logo", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(renderKlantEmail({ companyName: "A", companyLogo: png, heading: "x", bodyHtml: "" })).toContain(png);
    const svg = "data:image/svg+xml;base64,PHN2Zz4=";
    expect(renderKlantEmail({ companyName: "A", companyLogo: svg, heading: "x", bodyHtml: "" })).not.toContain(svg);
  });
  it("Saldova-mails krijgen het ei en het woordmerk op de donkere kop", () => {
    const html = renderEmail({ heading: "Welkom", bodyHtml: "" });
    expect(html).toContain("/icons/saldova-ei-96.png");
    expect(html).toContain("background:#0b0f14");
    expect(html).toContain('<span style="color:#a78bfa">SALD</span>OVA');
  });
});

describe("bonnetjes", () => {
  const b64 = (bytes: number[] | string) => Buffer.from(typeof bytes === "string" ? bytes : Uint8Array.from(bytes)).toString("base64");
  it("accepteert PNG, JPEG, WebP en pdf als de inhoud klopt", () => {
    expect(verifiedDocumentDataUrl(`data:image/png;base64,${b64([137, 80, 78, 71, 13, 10, 26, 10, 0])}`)).toMatch(/^data:image\/png;base64,/);
    expect(verifiedDocumentDataUrl(`data:image/jpeg;base64,${b64([255, 216, 255, 0])}`)).toMatch(/^data:image\/jpeg/);
    expect(verifiedDocumentDataUrl(`data:image/webp;base64,${b64("RIFF0000WEBPVP8 ")}`)).toMatch(/^data:image\/webp/);
    expect(verifiedDocumentDataUrl(`data:application/pdf;base64,${b64("%PDF-1.7\n")}`)).toMatch(/^data:application\/pdf/);
  });
  it("weigert SVG, HTML, een verkeerd type of te groot", () => {
    expect(verifiedDocumentDataUrl(`data:image/svg+xml;base64,${b64("<svg onload=alert(1)/>")}`)).toBeNull();
    expect(verifiedDocumentDataUrl(`data:image/png;base64,${b64("<html></html>")}`)).toBeNull();
    expect(verifiedDocumentDataUrl(`data:image/png;base64,${b64("%PDF-1.7")}`)).toBeNull();
    const big = new Uint8Array(2_000_001);
    big.set([37, 80, 68, 70, 45]);
    expect(verifiedDocumentDataUrl(`data:application/pdf;base64,${Buffer.from(big).toString("base64")}`)).toBeNull();
  });
  it("het schema laat geen SVG door", () => {
    const expense = { date: "2026-11-18", vendor: "Winkel", amountGross: 12.1, vatRate: 21 };
    expect(createExpenseSchema.safeParse({ ...expense, receipt: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...expense, receipt: "data:application/pdf;base64,JVBERi0=" }).success).toBe(true);
  });
});
