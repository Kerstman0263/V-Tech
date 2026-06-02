import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// Server-config: laadt het juiste vertaalbestand per request.
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Valideer en val terug op default als de locale onbekend is
  if (!locale || !routing.locales.includes(locale as never)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
