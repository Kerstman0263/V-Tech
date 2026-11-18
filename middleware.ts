import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isTrustedMutation, PROVIDER_WEBHOOKS } from "./lib/request-security";
import { createShield } from "./lib/wardova-shield";

// next-intl middleware: regelt locale-detectie + redirects (/ -> /nl).
// Auth-bescherming van het dashboard gebeurt in de (dashboard) layout
// via de server-side sessie (zie app/[locale]/(dashboard)/layout.tsx).
const localeMiddleware = createMiddleware(routing);

// Wardova Shield (de firewall van Wardova, ook een Ova-product). Staat alleen aan als
// WARDOVA_SHIELD_KEY gezet is; zonder sleutel verandert er niets.
// Saldova draait Shield hard in de Monitor-stand (monitorOnly): Shield kijkt alleen mee
// en meldt verdachte verzoeken; het blokkeert niets, ook niet als in Wardova per ongeluk
// protect of fortress is gekozen. Webhooks van Mollie en de mailprovider en de
// Vercel-cron gaan helemaal buiten Shield om.
// Alles is fail-open: is Wardova traag, onbereikbaar of gaat er iets mis, dan gaat het
// verzoek gewoon door naar Saldova.
const SHIELD_TIMEOUT_MS = 2_000;
const shield = startShield();

function startShield() {
  const siteKey = process.env.WARDOVA_SHIELD_KEY?.trim();
  if (!siteKey) return null;
  try {
    return createShield({ siteKey, monitorOnly: true });
  } catch {
    console.error("Wardova Shield staat uit: WARDOVA_SHIELD_KEY heeft niet de verwachte vorm.");
    return null;
  }
}

/** Machine-verkeer dat nooit door Shield mag worden opgehouden. */
function bypassesShield(pathname: string): boolean {
  return PROVIDER_WEBHOOKS.has(pathname) || pathname.startsWith("/api/cron/");
}

async function checkShield(request: NextRequest, event: NextFetchEvent | undefined): Promise<Response | null> {
  if (!shield || bypassesShield(request.nextUrl.pathname)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const waitUntil = typeof event?.waitUntil === "function" ? event.waitUntil.bind(event) : undefined;
    const verdict = shield.handle(request, { waitUntil }).catch(() => null);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), SHIELD_TIMEOUT_MS);
    });
    return await Promise.race([verdict, timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const blocked = await checkShield(request, event);
  if (blocked) return blocked;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (!PROVIDER_WEBHOOKS.has(request.nextUrl.pathname) && !isTrustedMutation(request)) {
      return NextResponse.json({ error: "Open Saldova opnieuw en probeer de actie nogmaals." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  return localeMiddleware(request);
}

export const config = {
  // Match alle paden behalve API, Next-internals en bestanden met extensie
  // (dus ook niet /.well-known/wardova-verification.txt: dat bestand komt direct uit public/).
  matcher: ["/api/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
