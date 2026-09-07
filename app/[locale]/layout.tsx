import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "../globals.css";

// Strakke, moderne schreefloze font. Self-hosted via next/font (geen CDN → CSP-veilig).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Saldova",
  description: "Betaalbare, strakke tools voor zzp'ers en kleine bedrijven.",
  // PWA: installeerbaar op telefoon (Android via manifest, iPhone via apple-*)
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Saldova" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// Mobile-first viewport. Bewust ZONDER `maximum-scale`/`user-scalable=no`:
// zoom uitschakelen is een toegankelijkheidsprobleem (slechtzienden kunnen
// dan niet inzoomen) én lost het schaalprobleem niet op — dat komt door
// horizontale overflow, die we in de layout met `min-w-0` verhelpen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0618",
  viewportFit: "cover",
};

// Genereer statische routes voor elke taal
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  // Messages expliciet meegeven zodat OOK client-componenten ze hebben
  // (anders tonen die de ruwe vertaalsleutels i.p.v. de tekst).
  const messages = await getMessages();

  return (
    <html lang={locale} className={inter.variable}>
      {/* suppressHydrationWarning: browser-extensies (bijv. valuta-omzetters)
          injecteren attributen op <body> vóór hydratie — dat negeren we. */}
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
