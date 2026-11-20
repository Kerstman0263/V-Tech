import bcrypt from "bcryptjs";
import { isDemoUser } from "@/lib/demo";
import { HttpError } from "@/lib/http-error";
import { isRateLimited, rateLimit, recordHit } from "@/lib/rate-limit";

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

/**
 * De limiet per IP-adres: zoveel pogingen per kwartier, geslaagd of niet, ongeacht het
 * e-mailadres. Beide inlogstappen tellen elk in een eigen emmer per IP-adres: de voor-controle
 * (/api/auth/2fa-check) en het echte inloggen (authorize in lib/auth.ts). Zo omzeil je de grens
 * niet door /api/auth/callback/credentials direct aan te roepen, en ook niet door per poging een
 * ander e-mailadres te kiezen. Een gewone login via het formulier kost in elke emmer één poging.
 * /beveiliging noemt deze getallen; ze komen hier vandaan.
 */
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;

/** De twee inlogstappen die elk per IP-adres worden geteld. */
export type LoginStep = "precheck" | "signin";

const ipBucket = (step: LoginStep, ip: string) => `${step === "precheck" ? "login" : "auth"}:${ip}`;

/**
 * Telt één inlogpoging voor dit IP-adres bij deze stap. True als de grens al bereikt was: dan
 * telt de poging niet mee en moet de aanroeper weigeren.
 */
export function loginIpLimited(step: LoginStep, ip: string): boolean {
  try {
    rateLimit(ipBucket(step, ip), LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS);
    return false;
  } catch (err) {
    if (err instanceof HttpError) return true;
    throw err;
  }
}

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
