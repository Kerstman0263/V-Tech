import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Logo } from "@/components/ui/Logo";
import { SiteMobileMenu } from "@/components/landing/SiteMobileMenu";
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
        "site-header sticky top-0 z-20 border-b backdrop-blur-xl",
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

        <nav className="hidden items-center gap-0.5 text-sm font-medium lg:flex">
          <Link href="/zzp" className={linkCls}>{t("forFreelancers")}</Link>
          <Link href="/webshops" className={cn(linkCls, "inline-flex items-center gap-1.5")}>
            {t("forWebshops")}
            <span className="rounded-full bg-brand-500/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand-200">{t("new")}</span>
          </Link>
          <Link href="/bedrijven" className={linkCls}>{t("forCompanies")}</Link>
          <Link href="/zzp#pricing" className={linkCls}>{t("pricing")}</Link>
          <Link href="/faq" className={linkCls}>{t("faq")}</Link>
        </nav>

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
    </header>
  );
}
