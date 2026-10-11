import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Zoekmachines: publieke pagina's wel, API en eenmalige links niet.
// Het dashboard zelf staat al op noindex (zie (dashboard)/layout.tsx).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/reset-password", "/en/reset-password", "/quote/", "/en/quote/", "/payment-return"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
