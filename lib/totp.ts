import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

/**
 * Tweestapsverificatie (TOTP, RFC 6238) — werkt met elke authenticator-app
 * (Google/Microsoft Authenticator, 1Password, Authy...).
 *
 * - Het geheim wordt versleuteld opgeslagen (lib/encryption) en hier alleen
 *   in het geheugen gebruikt.
 * - Back-upcodes: 10 eenmalige codes, opgeslagen als HMAC-SHA256-hashes
 *   (peppered met ENCRYPTION_KEY) zodat een database-lek ze niet prijsgeeft.
 */
const ISSUER = "Saldova";
const BACKUP_COUNT = 10;

function totpFor(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** Nieuw geheim (160-bit) in base32 — wat de authenticator-app opslaat. */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** otpauth://-URI voor de QR-code, plus de handmatige sleutel in groepjes van 4. */
export function totpProvisioning(secretBase32: string, email: string): { uri: string; manualKey: string } {
  const uri = totpFor(secretBase32, email).toString();
  const manualKey = secretBase32.replace(/(.{4})/g, "$1 ").trim();
  return { uri, manualKey };
}

/** QR-code als data-URL (PNG) — geen externe dienst, dus geen lek van het geheim. */
export async function totpQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M", color: { dark: "#17132B", light: "#FFFFFF" } });
}

/** Controleert een 6-cijferige code; 1 tijdvak speling voor klokverschil. */
export function verifyTotp(secretBase32: string, code: string): boolean {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  const delta = totpFor(secretBase32, "login").validate({ token, window: 1 });
  return delta !== null;
}

// --- Back-upcodes ---------------------------------------------------------

function pepper(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY ontbreekt");
  return key;
}

/** Normaliseert gebruikersinvoer: hoofdletters, zonder spaties/streepjes. */
export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashBackupCode(code: string): string {
  return crypto.createHmac("sha256", pepper()).update(normalizeBackupCode(code)).digest("hex");
}

/** 10 codes in de vorm ABCD-EFGH (zonder verwarrende tekens). */
export function generateBackupCodes(): { plain: string[]; hashes: string[] } {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const plain: string[] = [];
  for (let i = 0; i < BACKUP_COUNT; i++) {
    const bytes = crypto.randomBytes(8);
    let s = "";
    for (let j = 0; j < 8; j++) s += alphabet[bytes[j] % alphabet.length];
    plain.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return { plain, hashes: plain.map(hashBackupCode) };
}

/** Geeft de resterende hashes terug als de code klopt (de gebruikte vervalt), anders null. */
export function consumeBackupCode(input: string, hashes: string[]): string[] | null {
  const h = hashBackupCode(input);
  const idx = hashes.findIndex((x) => crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  if (idx === -1) return null;
  return hashes.filter((_, i) => i !== idx);
}
