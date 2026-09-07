import { describe, expect, it } from "vitest";
import { bareAddress, extractToken, generateInboundToken, normalizeJson, senderAllowed, shortText, usableAttachments } from "@/lib/inbound-mail";

describe("extractToken", () => {
  it("vindt het token in het inbound-adres, ook met naam en plus-adressering", () => {
    expect(extractToken(["Bonnen <abcd2345efgh67@in.saldova.nl>"], "in.saldova.nl")).toBe("abcd2345efgh67");
    expect(extractToken(["ABCD2345EFGH67+coolblue@IN.SALDOVA.NL"], "in.saldova.nl")).toBe("abcd2345efgh67");
  });
  it("negeert andere domeinen en ongeldige local parts", () => {
    expect(extractToken(["abcd2345efgh67@gmail.com"], "in.saldova.nl")).toBeNull();
    expect(extractToken(["info@in.saldova.nl"], "in.saldova.nl")).toBeNull();
    expect(extractToken([], "in.saldova.nl")).toBeNull();
  });
});

describe("generateInboundToken", () => {
  it("is 14 tekens, lowercase, zonder verwarrende tekens", () => {
    const t = generateInboundToken();
    expect(t).toMatch(/^[a-z0-9]{14}$/);
    expect(t).not.toMatch(/[01lio]/);
  });
});

describe("usableAttachments", () => {
  const a = (mimeType: string, size = 1000) => ({ fileName: "x", mimeType, base64: "AAAA", size });
  it("laat alleen foto's/PDF's binnen de limiet door", () => {
    const out = usableAttachments([a("image/jpeg"), a("application/pdf"), a("text/plain"), a("image/png", 6 * 1024 * 1024), a("image/png", 0)]);
    expect(out.map((x) => x.mimeType)).toEqual(["image/jpeg", "application/pdf"]);
  });
  it("maximaal 10 per mail", () => {
    expect(usableAttachments(Array.from({ length: 15 }, () => a("image/jpeg"))).length).toBe(10);
  });
});

describe("senderAllowed / bareAddress", () => {
  it("vergelijkt kale adressen hoofdletterongevoelig", () => {
    expect(bareAddress("Jan Jansen <Jan@Bedrijf.nl>")).toBe("jan@bedrijf.nl");
    expect(senderAllowed("Jan <JAN@bedrijf.nl>", ["jan@bedrijf.nl", "piet@bedrijf.nl"])).toBe(true);
    expect(senderAllowed("spam@evil.com", ["jan@bedrijf.nl"])).toBe(false);
  });
});

describe("normalizeJson", () => {
  it("eigen formaat", () => {
    const m = normalizeJson({ to: "tok@in.saldova.nl", from: "a@b.nl", subject: "Bon", text: "hoi", attachments: [{ filename: "bon.jpg", contentType: "image/jpeg", content: "QUJD" }] });
    expect(m?.to).toEqual(["tok@in.saldova.nl"]);
    expect(m?.attachments[0]).toMatchObject({ fileName: "bon.jpg", mimeType: "image/jpeg", base64: "QUJD", size: 3 });
  });
  it("Resend email.received-envelop", () => {
    const m = normalizeJson({ type: "email.received", data: { to: ["tok@in.saldova.nl"], from: "a@b.nl", subject: "S", text: "T", attachments: [{ filename: "b.pdf", content_type: "application/pdf", content: "data:application/pdf;base64,QUJD" }] } });
    expect(m?.attachments[0].mimeType).toBe("application/pdf");
    expect(m?.attachments[0].base64).toBe("QUJD");
  });
  it("Postmark-achtig formaat", () => {
    const m = normalizeJson({ ToFull: [{ Email: "tok@in.saldova.nl" }], From: "a@b.nl", Subject: "S", TextBody: "T", Attachments: [{ Name: "b.png", ContentType: "image/png", Content: "QUJD", ContentLength: 3 }] });
    expect(m?.to).toEqual(["tok@in.saldova.nl"]);
    expect(m?.attachments[0].fileName).toBe("b.png");
  });
  it("onbruikbare body -> null", () => {
    expect(normalizeJson(null)).toBeNull();
    expect(normalizeJson({})).toBeNull();
  });
});

describe("shortText", () => {
  it("kort in en ruimt lege regels op", () => {
    expect(shortText("a\r\n\n\n\nb")).toBe("a\n\nb");
    expect(shortText("x".repeat(1200))?.length).toBe(1001);
    expect(shortText("")).toBeNull();
  });
});
