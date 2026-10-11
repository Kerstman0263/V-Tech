import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Centrale SEO-gegevens: per pagina een eigen titel/omschrijving (NL/EN),
 * canonical + hreflang, en Open Graph/Twitter voor nette deelkaarten.
 * Teksten staan in messages/*.json onder "meta.pages.<key>".
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app").replace(/\/$/, "");

/** Publieke, indexeerbare pagina's (pad zonder taalprefix). */
export const PUBLIC_PAGES = {
  home: "/",
  zzp: "/zzp",
  bedrijven: "/bedrijven",
  about: "/about",
  faq: "/faq",
  reviews: "/reviews",
  contact: "/contact",
  windows: "/windows",
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  dpa: "/legal/dpa",
  login: "/login",
  register: "/register",
} as const;

export type PageKey = keyof typeof PUBLIC_PAGES;

/** URL van een pad in een taal (NL zonder prefix, EN met /en). */
export function localizedUrl(path: string, locale: string): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const tail = path === "/" ? "" : path;
  return `${SITE_URL}${prefix}${tail}` || SITE_URL;
}

export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localizedUrl(path, l);
  languages["x-default"] = localizedUrl(path, routing.defaultLocale);
  return languages;
}

export async function pageMetadata(
  locale: string,
  key: PageKey,
  opts: { noindex?: boolean } = {},
): Promise<Metadata> {
  const t = await getTranslations({ locale: locale as Locale, namespace: "meta" });
  const path = PUBLIC_PAGES[key];
  const title = t(`pages.${key}.title`);
  const description = t(`pages.${key}.description`);
  const url = localizedUrl(path, locale);
  return {
    // De homepage gebruikt de volledige titel; overige pagina's krijgen " | Saldova".
    title: key === "home" ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      siteName: "Saldova",
      title,
      description,
      url,
      locale: locale === "en" ? "en_GB" : "nl_NL",
    },
    twitter: { card: "summary_large_image", title, description },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
