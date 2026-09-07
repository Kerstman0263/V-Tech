/** Browser requests that change state must originate from this application. */
export function isTrustedMutation(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return origin !== "null" && new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  // Non-browser clients do not send Origin. Modern browsers still provide
  // Fetch Metadata; reject cross-site and opaque contexts without weakening auth.
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

export const PROVIDER_WEBHOOKS = new Set([
  "/api/webhooks/mollie",
  "/api/inbound/email",
]);
