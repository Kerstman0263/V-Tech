import type { MetadataRoute } from "next";

// PWA-manifest via Next's metadata-conventie: geserveerd op /manifest.webmanifest.
// Maakt Saldova installeerbaar op Android (installatieknop) en iPhone
// (Delen -> Zet op beginscherm): eigen icoon, volledig scherm, geen browserbalk.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saldova",
    short_name: "Saldova",
    description: "Administratie zonder stress — facturen, uren, ritten en belastingbuffer voor zzp'ers en mkb.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0618",
    theme_color: "#0A0618",
    lang: "nl",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nieuwe factuur", url: "/invoices/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Uren", url: "/time", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Snelle offerte", url: "/snelle-offerte", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
