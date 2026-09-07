import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Koppelt next-intl aan de server-config in i18n/request.ts
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  distDir: process.env.SALDOVA_TEST_INSTANCE === "1" ? ".next-test" : ".next",
  reactStrictMode: true,
  // Mollie-client gebruikt Node APIs; markeer als extern voor serverless bundling
  serverExternalPackages: ["@mollie/api-client", "@prisma/client", "bcryptjs"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'" },
      ],
    }];
  },
};

export default withNextIntl(nextConfig);
