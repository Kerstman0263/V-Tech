import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Logo } from "@/components/ui/Logo";
import { SiteMobileMenu } from "@/components/landing/SiteMobileMenu";
import { cn } from "@/lib/utils";

// Gedeelde marketing-header. `light` schakelt naar het lichte thema (home).
export function SiteHeader({ light = false }: { light?: boolean }) {
  const t = useTranslations("landing.nav");

  const links = [
    { href: "/about", label: t("about") },
    { href: "/faq", label: t("faq") },
    { href: "/contact", label: t("contact") },
  ];

  const linkCls = cn("transition-colors", light ? "text-slate-600 hover:text-slate-900" : "text-slate-400 hover:text-white");

  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b backdrop-blur-md",
        light ? "border-slate-200 bg-white/80" : "border-white/[0.06] bg-surface/70",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-[25px] w-[25px]" />
          <span className={cn("text-lg font-bold", light ? "text-slate-900" : "text-white")}>
            Saldo<span className="text-brand-500">va</span>
          </span>
        </Link>

        <nav className={cn("hidden items-center gap-6 text-sm font-medium md:flex", light ? "text-slate-600" : "text-slate-400")}>
          <Link href="/" className={linkCls}>{t("home")}</Link>
          <Link href="/zzp" className={linkCls}>{t("forFreelancers")}</Link>
          <Link href="/bedrijven" className={linkCls}>{t("forCompanies")}</Link>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkCls}>{l.label}</Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />
          <Link href="/login" className={cn("hidden text-sm font-medium sm:block", linkCls)}>
            {t("login")}
          </Link>
          <Link
            href="/register"
            className="hidden rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md sm:block"
          >
            {t("start")}
          </Link>
          <SiteMobileMenu light={light} />
        </div>
      </div>
    </header>
  );
}
