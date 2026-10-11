import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { PUBLIC_PAGES, languageAlternates, localizedUrl } from "@/lib/seo";

const PRIORITY: Partial<Record<keyof typeof PUBLIC_PAGES, number>> = { home: 1, zzp: 0.9, bedrijven: 0.9, faq: 0.7, about: 0.6, reviews: 0.6 };

// Elke publieke pagina in elke taal, met hreflang-alternatieven.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return Object.entries(PUBLIC_PAGES).flatMap(([key, path]) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(path, locale),
      lastModified,
      changeFrequency: key.startsWith("home") ? "weekly" : "monthly",
      priority: PRIORITY[key as keyof typeof PUBLIC_PAGES] ?? 0.4,
      alternates: { languages: languageAlternates(path) },
    })),
  );
}
