import { describe, expect, it } from "vitest";
import {
  extractSenderAuth,
  generateInboundToken,
  normalizeJson,
  parseAuthResult,
  parseAuthenticationResults,
  senderAuthVerdict,
  webhookAuthorized,
} from "@/lib/inbound-mail";
import { isPrivateIp } from "@/lib/webshop/safe-url";

const SECRET = "test-geheim-1234567890";
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

describe("inbound-webhook: alleen de Authorization-header", () => {
  it("accepteert Bearer met het juiste geheim", () => {
    expect(webhookAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(webhookAuthorized(`bearer   ${SECRET}`, SECRET)).toBe(true);
  });
  it("accepteert Basic met het geheim als wachtwoord", () => {
    expect(webhookAuthorized(basic("inbox", SECRET), SECRET)).toBe(true);
    expect(webhookAuthorized(basic("", SECRET), SECRET)).toBe(true);
  });
  it("weigert fout, te kort, te lang of ontbrekend", () => {
    expect(webhookAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(webhookAuthorized(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
    expect(webhookAuthorized(SECRET, SECRET)).toBe(false);
    expect(webhookAuthorized(basic(SECRET, "fout"), SECRET)).toBe(false);
    expect(webhookAuthorized(null, SECRET)).toBe(false);
    expect(webhookAuthorized(`Bearer ${SECRET}`, "")).toBe(false);
    expect(webhookAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
  });
});

describe("generateInboundToken", () => {
  it("gebruikt de meegegeven kiezer (standaard crypto.randomInt)", () => {
    expect(generateInboundToken(() => 0)).toBe("aaaaaaaaaaaaaa");
    const calls: number[] = [];
    generateInboundToken((max) => {
      calls.push(max);
      return max - 1;
    });
    expect(calls).toHaveLength(14);
    expect(new Set(calls)).toEqual(new Set([31]));
  });
  it("geeft verschillende tokens", () => {
    const set = new Set(Array.from({ length: 50 }, () => generateInboundToken()));
    expect(set.size).toBe(50);
  });
});

describe("SPF/DKIM/DMARC uit de payload", () => {
  it("leest losse uitslagen", () => {
    expect(parseAuthResult("pass")).toBe("pass");
    expect(parseAuthResult("Pass (sender SPF authorized)")).toBe("pass");
    expect(parseAuthResult("softfail")).toBe("fail");
    expect(parseAuthResult("FAIL")).toBe("fail");
    expect(parseAuthResult("none")).toBe("neutral");
    expect(parseAuthResult("{@bedrijf.nl : pass}")).toBe("pass");
    expect(parseAuthResult("{@a.nl : fail}, {@b.nl : pass}")).toBe("pass");
    expect(parseAuthResult("")).toBeUndefined();
    expect(parseAuthResult(42)).toBeUndefined();
  });
  it("leest een Authentication-Results-header", () => {
    expect(parseAuthenticationResults("mx.example; spf=pass smtp.mailfrom=a.nl; dkim=fail header.d=a.nl; dmarc=pass")).toEqual({
      spf: "pass",
      dkim: "fail",
      dmarc: "pass",
    });
  });
  it("Postmark-stijl headers en Mailgun-velden", () => {
    const pm = normalizeJson({
      From: "jan@bedrijf.nl",
      To: "abcd2345efgh67@in.saldova.nl",
      Headers: [{ Name: "Received-SPF", Value: "Fail (bedrijf.nl: domain does not designate)" }],
    });
    expect(pm?.auth).toEqual({ spf: "fail" });
    const mg = extractSenderAuth((k) => ({ "X-Mailgun-Spf": "Pass", "X-Mailgun-Dkim-Check-Result": "Pass" })[k]);
    expect(mg).toEqual({ spf: "pass", dkim: "pass" });
  });
  it("ruwe headertekst en een JSON-lijst (multipart-providers)", () => {
    const raw = "Received: by mx\nAuthentication-Results: mx.example;\n spf=softfail smtp.mailfrom=bedrijf.nl;\n dkim=none\nSubject: Bon";
    expect(extractSenderAuth(() => "", raw)).toEqual({ spf: "fail", dkim: "neutral" });
    expect(extractSenderAuth(() => "", JSON.stringify([["Authentication-Results", "x; dmarc=fail"]]))).toEqual({ dmarc: "fail" });
  });
  it("geen controles in de payload: geen auth-veld", () => {
    expect(normalizeJson({ from: "jan@bedrijf.nl", to: ["abcd2345efgh67@in.saldova.nl"] })?.auth).toBeUndefined();
  });
  it("oordeel: gezakt alleen als niets slaagt (of DMARC zakt)", () => {
    expect(senderAuthVerdict(undefined)).toBe("unknown");
    expect(senderAuthVerdict({})).toBe("unknown");
    expect(senderAuthVerdict({ spf: "neutral", dkim: "neutral" })).toBe("unknown");
    expect(senderAuthVerdict({ spf: "fail", dkim: "pass" })).toBe("pass");
    expect(senderAuthVerdict({ spf: "fail" })).toBe("fail");
    expect(senderAuthVerdict({ spf: "pass", dmarc: "fail" })).toBe("fail");
  });
});

describe("isPrivateIp (SSRF)", () => {
  it("blokkeert privé, lokale en speciale IPv4-bereiken", () => {
    for (const ip of [
      "0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.31.255.255", "192.168.0.1",
      "100.64.0.0", "100.127.255.255", // 100.64.0.0/10
      "192.0.0.8", "192.0.2.10", "198.51.100.7", "203.0.113.200", // IETF + documentatie
      "198.18.0.1", "224.0.0.1", "255.255.255.255",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("laat gewone publieke IPv4-adressen door, ook vlak naast de bereiken", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "100.63.255.255", "100.128.0.1", "192.0.78.9", "198.51.101.1", "203.0.114.1", "172.32.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
  it("blokkeert speciale IPv6-bereiken", () => {
    for (const ip of [
      "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1",
      "64:ff9b::1", "64:ff9b::a9fe:a9fe", "64:ff9b::8.8.8.8", // NAT64 (64:ff9b::/96)
      "2001:db8::1", "2001:0db8:ffff::1", // documentatie
      "fd00::1", "fc00::1", "fe80::1", "fe80::1%eth0", "ff02::1", "2002:7f00:1::1",
      "[::1]",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("laat publieke IPv6 en publieke ::ffff-adressen door", () => {
    for (const ip of ["2a00:1450:400e:80c::200e", "2606:4700::6810:84e5", "::ffff:93.184.216.34", "2001:db9::1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
  it("onleesbaar adres: liever niet", () => {
    expect(isPrivateIp("geen-ip")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
  });
});
