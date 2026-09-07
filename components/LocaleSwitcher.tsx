"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { Select } from "@/components/ui/Select";

type Locale = (typeof routing.locales)[number];

// Wisselt van taal en behoudt het huidige pad.
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Select
      value={locale}
      onChange={(v) => router.replace(pathname, { locale: v as Locale })}
      options={routing.locales.map((loc) => ({ value: loc, label: loc.toUpperCase() }))}
      ariaLabel="Language"
      menuAlign="right"
      buttonClassName="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm font-medium text-slate-300 outline-none transition-colors hover:bg-white/[0.08] hover:text-white"
    />
  );
}
