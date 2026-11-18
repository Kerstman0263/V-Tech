import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Logo } from "@/components/ui/Logo";
import { SiteMobileMenu } from "@/components/landing/SiteMobileMenu";
import { SiteNav, HeaderScrollShadow } from "@/components/landing/SiteNav";
import { cn } from "@/lib/utils";

// Gedeelde marketing-header. `light` schakelt naar het lichte thema.
export function SiteHeader({ light = false }: { light?: boolean }) {
  const t = useTranslations("landing.nav");

  const linkCls = cn(
    "rounded-lg px-3 py-2 transition-colors",
    light ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900" : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
  );

  return (
    <header
      className={cn(
        "site-header sticky top-0 z-20 border-b backdrop-blur-xl transition-[background-color,box-shadow] duration-300",
        light ? "border-slate-200 bg-white/80" : "border-white/[0.06] bg-[#0A0618]/75",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo className="h-[26px] w-[26px]" />
          <span className={cn("font-display text-lg font-extrabold tracking-tight", light ? "text-slate-900" : "text-white")}>
            Saldo<span className="text-brand-400">va</span>
          </span>
        </Link>

        <SiteNav light={light} />

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />
          <Link href="/login" className={cn("hidden text-sm font-medium sm:block", linkCls)}>
            {t("login")}
          </Link>
          <Link
            href="/register"
            className="hidden rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0A0618] transition-all duration-200 hover:bg-brand-50 sm:block"
          >
            {t("start")}
          </Link>
          <SiteMobileMenu light={light} />
        </div>
      </div>
      <p className={cn("border-t px-6 py-2 text-center text-xs", light ? "border-slate-100 text-slate-600" : "border-white/[0.06] text-slate-400")}>
        {t("prelaunch")}
      </p>
      <HeaderScrollShadow />
    </header>
  );
}
