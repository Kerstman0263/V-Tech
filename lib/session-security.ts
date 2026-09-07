import { createHash } from "node:crypto";

/** Server-only fingerprint. Never expose password hashes in the public session. */
export function credentialFingerprint(passwordHash: string, totpEnabledAt?: Date | null): string {
  return createHash("sha256").update(`${passwordHash}\0${totpEnabledAt?.toISOString() ?? ""}`).digest("hex");
}

export function credentialsUnchanged(fingerprint: unknown, passwordHash: string, totpEnabledAt?: Date | null): boolean {
  return typeof fingerprint === "string" && fingerprint === credentialFingerprint(passwordHash, totpEnabledAt);
}
