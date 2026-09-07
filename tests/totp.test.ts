import { describe, it, expect, beforeAll } from "vitest";
import * as OTPAuth from "otpauth";
import {
  generateTotpSecret,
  totpProvisioning,
  verifyTotp,
  generateBackupCodes,
  consumeBackupCode,
  normalizeBackupCode,
} from "@/lib/totp";

beforeAll(() => {
  // Pepper voor de back-upcode-hashes (zelfde sleutel als lib/encryption)
  process.env.ENCRYPTION_KEY = "a".repeat(64);
});

describe("TOTP", () => {
  it("genereert een base32-geheim en een otpauth-URI met issuer Saldova", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const { uri, manualKey } = totpProvisioning(secret, "test@saldova.nl");
    expect(uri.startsWith("otpauth://totp/Saldova:test%40saldova.nl?")).toBe(true);
    expect(uri).toContain("issuer=Saldova");
    expect(manualKey.replace(/ /g, "")).toBe(secret);
  });

  it("accepteert de code die een authenticator-app nu zou tonen, en weigert onzin", () => {
    const secret = generateTotpSecret();
    const app = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
    const now = app.generate();
    expect(verifyTotp(secret, now)).toBe(true);
    expect(verifyTotp(secret, `${now.slice(0, 3)} ${now.slice(3)}`)).toBe(true); // spaties mogen
    expect(verifyTotp(secret, "000000")).toBe(now === "000000"); // vrijwel altijd false
    expect(verifyTotp(secret, "12345")).toBe(false); // te kort
    expect(verifyTotp(secret, "abcdef")).toBe(false);
  });

  it("weigert een code van een ander geheim", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    const codeForB = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(b) }).generate();
    expect(verifyTotp(a, codeForB)).toBe(codeForB === new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(a) }).generate());
  });
});

describe("back-upcodes", () => {
  it("maakt 10 unieke codes in ABCD-EFGH-vorm en slaat alleen hashes op", () => {
    const { plain, hashes } = generateBackupCodes();
    expect(plain).toHaveLength(10);
    expect(new Set(plain).size).toBe(10);
    for (const c of plain) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes).not.toContain(plain[0]);
  });

  it("verbruikt een code eenmalig, ongeacht hoofdletters/streepjes", () => {
    const { plain, hashes } = generateBackupCodes();
    const sloppy = plain[3].toLowerCase().replace("-", " ");
    expect(normalizeBackupCode(sloppy)).toBe(plain[3].replace("-", ""));
    const remaining = consumeBackupCode(sloppy, hashes);
    expect(remaining).not.toBeNull();
    expect(remaining).toHaveLength(9);
    // Dezelfde code nog een keer: niet meer geldig
    expect(consumeBackupCode(plain[3], remaining!)).toBeNull();
    // Verzonnen code: niet geldig
    expect(consumeBackupCode("ZZZZ-ZZZZ", hashes)).toBeNull();
  });
});
