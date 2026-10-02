import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse, type NextRequest } from "next/server";
import { isTrustedMutation, PROVIDER_WEBHOOKS } from "./lib/request-security";

// next-intl middleware: regelt locale-detectie + redirects (/ -> /nl).
// Auth-bescherming van het dashboard gebeurt in de (dashboard) layout
// via de server-side sessie (zie app/[locale]/(dashboard)/layout.tsx).
const localeMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
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
  matcher: ["/api/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
