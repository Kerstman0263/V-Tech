import crypto from "node:crypto";

/**
 * AVG-proof veld-encryptie met AES-256-GCM.
 *
 * Gebruik dit voor gevoelige persoons-/bedrijfsgegevens (KvK, BTW, adres)
 * vóór ze in de database gaan, en decrypt bij het uitlezen.
 *
 * De sleutel komt uit ENCRYPTION_KEY (32 bytes als 64 hex-tekens).
 * Genereer met: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Formaat van de opgeslagen string: iv:authTag:ciphertext  (alles hex)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is aanbevolen voor GCM

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY ontbreekt of is geen 64 hex-tekens (32 bytes). Zie .env.example.",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Versleutelt een plain-text string. Geeft `null` terug bij lege input. */
export function encrypt(plainText: string | null | undefined): string | null {
  if (plainText == null || plainText === "") return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Ontsleutelt een eerder met encrypt() versleutelde string. */
export function decrypt(payload: string | null | undefined): string | null {
  if (payload == null || payload === "") return null;

  const [ivHex, authTagHex, dataHex] = payload.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Ongeldig encrypted formaat (verwacht iv:authTag:data).");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
