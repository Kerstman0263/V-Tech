import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// next-intl middleware: regelt locale-detectie + redirects (/ -> /nl).
// Auth-bescherming van het dashboard gebeurt in de (dashboard) layout
// via de server-side sessie (zie app/[locale]/(dashboard)/layout.tsx).
export default createMiddleware(routing);

export const config = {
  // Match alle paden behalve API, Next-internals en bestanden met extensie
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
