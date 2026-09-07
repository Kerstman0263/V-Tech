import { HttpError } from "@/lib/http-error";

/**
 * Eenvoudige rate-limiter (sliding window, in-memory).
 *
 * Eerlijk over de reikwijdte: op serverless (Vercel) leeft dit geheugen per
 * warme instantie, dus het is een drempel tegen simpele scripts en
 * formulier-spam — geen waterdichte bescherming tegen gedistribueerde
 * aanvallen. Voor die laatste stap is een gedeelde store (Redis/Upstash) of
 * een WAF nodig; de aanroepplekken hoeven daarvoor niet te veranderen.
 */
const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    throw new HttpError(429, "Te veel verzoeken. Probeer het over een tijdje opnieuw.");
  }
  hits.push(now);
  buckets.set(key, hits);

  // Geheugen begrensd houden: oudste sleutels weggooien als de map volloopt.
  if (buckets.size > MAX_KEYS) {
    const first = buckets.keys().next().value;
    if (first !== undefined) buckets.delete(first);
  }
}

/** Client-IP: Vercel zet x-forwarded-for zelf (eerste waarde = client). */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Rate-limit + nette 429-JSON i.p.v. een exception (voor publieke routes). */
export function rateLimitResponse(key: string, limit: number, windowMs: number): Response | null {
  try {
    rateLimit(key, limit, windowMs);
    return null;
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
