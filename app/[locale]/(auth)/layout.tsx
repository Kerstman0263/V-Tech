import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { DesktopChrome } from "@/components/desktop/DesktopChrome";
import { Logo } from "@/components/ui/Logo";
import { Woordmerk } from "@/components/ova-ei";
import { Icon } from "@/components/ui/Icon";

// Auth-pagina's (login/registratie): in de desktop-app is het venster
// randloos, dus hier een sleepstrook bovenaan zodat het venster ook op
// deze schermen versleepbaar is. In de browser rendert dit niets.
// Daarnaast: logo + "terug naar de website" en een korte vertrouwensregel.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("auth.chrome");
  return (
    <>
      <DesktopChrome />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label="Saldova" className="pointer-events-auto flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]">
          <Logo className="h-[26px] w-[26px]" />
          <Woordmerk naam="Saldova" kleur="text-saldova-licht" className="text-[15px] text-white" />
        </Link>
        <Link href="/" className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white">
          <Icon name="arrow-right" className="h-4 w-4 rotate-180" />
          {t("back")}
        </Link>
      </div>
      {/* Op mobiel ruimte voor de logobalk, zodat die nooit over het formulier valt. */}
      <div className="pt-16 sm:pt-0">{children}</div>
      <ul className="pointer-events-none absolute inset-x-0 bottom-0 hidden flex-wrap items-center justify-center gap-x-5 gap-y-1 px-6 py-5 text-xs text-slate-400 sm:flex [@media(max-height:820px)]:!hidden">
        <li className="inline-flex items-center gap-1.5"><Icon name="lock" className="h-3.5 w-3.5" />{t("encrypted")}</li>
        <li className="inline-flex items-center gap-1.5"><Icon name="globe" className="h-3.5 w-3.5" />{t("eu")}</li>
        <li className="inline-flex items-center gap-1.5"><Icon name="calendar" className="h-3.5 w-3.5" />{t("cancel")}</li>
      </ul>
    </>
  );
}
