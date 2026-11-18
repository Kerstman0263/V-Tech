import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SaldovaLogo } from "@/components/ui/SaldovaLogo";
import { SiteMobileMenu } from "@/components/landing/SiteMobileMenu";
import { SiteNav, HeaderScrollShadow } from "@/components/landing/SiteNav";
import { cn } from "@/lib/utils";
import { isLaunched } from "@/lib/company";

// Gedeelde marketing-header. `light` schakelt naar het lichte thema.
export function SiteHeader({ light = false }: { light?: boolean }) {
  const t = useTranslations("landing.nav");
  // "Nog niet gelanceerd" verdwijnt vanzelf na de lancering (lib/company.ts).
  const launched = isLaunched();

  const linkCls = cn(
    "rounded-lg px-3 py-2 transition-colors",
    light ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900" : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
  );

  return (
    <header
      className={cn(
        "site-header sticky top-0 z-20 border-b backdrop-blur-xl transition-[background-color,box-shadow] duration-300",
        light ? "border-slate-200 bg-white/80" : "border-rand bg-grond/80",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3.5">
        <SaldovaLogo
          href="/"
          label={t("homeAria")}
          className="shrink-0"
          kleur={light ? "text-saldova" : "text-saldova-licht"}
          woordClassName={cn("text-[15px]", light ? "text-slate-900" : "text-white")}
        />

        <SiteNav light={light} />

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />
          <Link href="/login" className={cn("hidden text-sm font-medium sm:block", linkCls)}>
            {t("login")}
          </Link>
          <Link
            href="/register"
            className="hidden rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0b0f14] transition-colors duration-200 hover:bg-slate-100 focus-visible:outline-saldova-licht sm:block"
          >
            {t("start")}
          </Link>
          <SiteMobileMenu light={light} />
        </div>
      </div>
      {!launched && (
        <p className={cn("border-t px-6 py-2 text-center text-xs", light ? "border-slate-100 text-slate-600" : "border-rand text-slate-400")}>
          {t("prelaunch")}
        </p>
      )}
      <HeaderScrollShadow />
    </header>
  );
}
