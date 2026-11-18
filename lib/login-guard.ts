import bcrypt from "bcryptjs";
import { isDemoUser } from "@/lib/demo";
import { isRateLimited, recordHit } from "@/lib/rate-limit";

/**
 * Extra rem op inloggen, bovenop de limiet per IP-adres.
 *
 * Een aanvaller met veel IP-adressen omzeilt een limiet per IP. Daarom tellen
 * we ook de MISLUKTE pogingen per e-mailadres, over alle IP's samen. Zowel de
 * voor-controle (/api/auth/2fa-check) als het echte inloggen (authorize in
 * lib/auth.ts) gebruiken dezelfde emmer, zodat je de limiet niet omzeilt door
 * de ene route te gebruiken in plaats van de andere.
 *
 * Alleen mislukte pogingen tellen: wie het juiste wachtwoord heeft, sluit
 * zichzelf nooit buiten. Het demo-account (wachtwoord staat openbaar op de
 * loginpagina) telt niet mee; raden heeft daar geen zin en een limiet zou de
 * demo voor alle bezoekers blokkeren.
 *
 * Net als lib/rate-limit is dit per serverinstantie (in het geheugen).
 */
export const LOGIN_EMAIL_LIMIT = 10;
export const LOGIN_EMAIL_WINDOW_MS = 15 * 60 * 1000;

const bucket = (email: string) => `login-email:${email.trim().toLowerCase()}`;

/** True als er voor dit e-mailadres te veel mislukte pogingen zijn. */
export function loginEmailBlocked(email: string): boolean {
  if (isDemoUser({ email })) return false;
  return isRateLimited(bucket(email), LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW_MS);
}

/** Registreert een mislukte poging (onbekend adres, fout wachtwoord of foute code). */
export function recordLoginFailure(email: string): void {
  if (isDemoUser({ email })) return;
  recordHit(bucket(email), LOGIN_EMAIL_WINDOW_MS);
}

/**
 * Vaste bcrypt-hash (kosten 12, zoals echte wachtwoorden) van een willekeurige
 * tekst die nergens bewaard is. Bij een onbekend e-mailadres vergelijken we
 * hiermee, zodat het antwoord even lang duurt als bij een bestaand account en
 * je aan de reactietijd niet kunt zien welke adressen bestaan.
 */
const DUMMY_HASH = "$2a$12$dackKTYK4vAX2bWImPDd2ezR.Ixyxryg3YuNAPTzfSyBk1cwuBUxO";

/** Vergelijkt het wachtwoord met de echte hash, of met de dummy als er geen gebruiker is. */
export async function verifyPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, passwordHash ?? DUMMY_HASH);
  return ok && !!passwordHash;
}
