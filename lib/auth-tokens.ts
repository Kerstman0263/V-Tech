import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenType } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Eenmalige, aflopende links voor wachtwoord-reset en e-mailverificatie.
 *
 * - De token (32 willekeurige bytes) bestaat alleen in de e-maillink; in de
 *   database staat uitsluitend de SHA-256-hash. Een gelekte database levert
 *   dus geen bruikbare links op.
 * - Een nieuwe link maakt eerdere, ongebruikte links van hetzelfde type
 *   ongeldig: alleen de laatst verstuurde mail werkt.
 * - Inwisselen gebeurt atomair (updateMany op usedAt = null), zodat dezelfde
 *   link bij gelijktijdige verzoeken maar één keer slaagt.
 */

export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  PASSWORD_RESET: 60 * 60 * 1000, // 1 uur
  EMAIL_VERIFY: 7 * 24 * 60 * 60 * 1000, // 7 dagen
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token-vorm valideren vóór een databasequery (base64url, 43 tekens). */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function createAuthToken(userId: string, type: AuthTokenType, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: now } }),
    db.authToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[type]) },
    }),
  ]);
  return token;
}

/** Geeft de userId terug als de token geldig is, zonder hem in te wisselen. */
export async function peekAuthToken(token: string, type: AuthTokenType, now = new Date()): Promise<string | null> {
  if (!isWellFormedToken(token)) return null;
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt <= now) return null;
  return row.userId;
}

/** Wisselt de token eenmalig in. Geeft de userId terug, of null als hij ongeldig/verlopen/gebruikt is. */
export async function consumeAuthToken(token: string, type: AuthTokenType, now = new Date()): Promise<string | null> {
  if (!isWellFormedToken(token)) return null;
  const tokenHash = hashToken(token);
  const claimed = await db.authToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return null;
  const row = await db.authToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  return row?.userId ?? null;
}
