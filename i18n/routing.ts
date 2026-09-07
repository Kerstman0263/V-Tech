import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  // Ondersteunde talen
  locales: ["nl", "en"],
  // Standaardtaal (Saldova is Nederlands bedrijf)
  defaultLocale: "nl",
  // "as-needed": /invoices -> nl (default, geen prefix), /en/invoices -> en
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

// Locale-bewuste navigatie-helpers (gebruik deze i.p.v. next/link & next/navigation)
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
