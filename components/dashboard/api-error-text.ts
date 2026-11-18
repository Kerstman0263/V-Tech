/**
 * Nette foutmeldingen uit API-antwoorden, voor alle app-schermen.
 *
 * De API geeft Nederlandse meldingen terug (soms met een `code`). In het
 * Nederlands tonen we die melding; in het Engels (of als de melding een kale
 * technische tekst is, zoals "Validation failed" of "Not found") tonen we een
 * vertaalde algemene melding. Het demo-account krijgt altijd een eigen,
 * vertaalde uitleg.
 */

export type ApiErrorBody = {
  error?: unknown;
  code?: unknown;
  issues?: { fieldErrors?: Record<string, unknown> } | null;
} | null | undefined;

/** De vaste tekst van DemoLockedError in lib/demo.ts. */
const DEMO_LOCKED_TEXT = "In de demo kun je dit niet wijzigen";

/** Technische of Engelse standaardteksten die een gebruiker nooit kaal moet zien. */
const TECHNICAL =
  /^(validation failed|not found|unauthori[sz]ed|forbidden|bad request|internal server error|error|required|invalid( input)?|expected\b|string must|number must|array must|too (small|big)|missing\b)/i;

export function isDemoLocked(status: number, data: ApiErrorBody): boolean {
  if (status !== 403 || !data) return false;
  return data.code === "demo_locked" || (typeof data.error === "string" && data.error.startsWith(DEMO_LOCKED_TEXT));
}

/** Eerste veldmelding uit een zod-fout (`issues.fieldErrors`), als die er is. */
function firstIssue(data: ApiErrorBody): string | null {
  const fields = data?.issues?.fieldErrors;
  if (!fields || typeof fields !== "object") return null;
  for (const value of Object.values(fields)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first.trim()) return first;
  }
  return null;
}

/** Interne codes zoals "already_closed" of "wrong_password" zijn geen zin voor een mens. */
const CODE = /^[a-z0-9]+(_[a-z0-9]+)+$/;

function readable(text: unknown): text is string {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  return trimmed !== "" && !TECHNICAL.test(trimmed) && !CODE.test(trimmed);
}

export function friendlyApiError({
  status,
  data,
  locale,
  fallback,
  demoLocked,
}: {
  status: number;
  data: ApiErrorBody;
  locale: string;
  fallback: string;
  demoLocked: string;
}): string {
  if (isDemoLocked(status, data)) return demoLocked;
  // Serverfouten (5xx) hebben al een algemene tekst; laat de vertaalde terugval spreken.
  if (locale !== "nl" || status >= 500) return fallback;
  const issue = firstIssue(data);
  if (readable(issue)) return issue;
  const message = data?.error;
  if (readable(message)) return message;
  return fallback;
}

/** Leest de JSON van een antwoord zonder te gooien (leeg of geen JSON = null). */
export async function readApiBody(res: Response): Promise<ApiErrorBody> {
  return (await res.json().catch(() => null)) as ApiErrorBody;
}
