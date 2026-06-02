import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Koppelt next-intl aan de server-config in i18n/request.ts
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Mollie-client gebruikt Node APIs; markeer als extern voor serverless bundling
  serverExternalPackages: ["@mollie/api-client", "@prisma/client", "bcryptjs"],
};

export default withNextIntl(nextConfig);
