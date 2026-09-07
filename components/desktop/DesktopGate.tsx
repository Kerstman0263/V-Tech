import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { DesktopChrome } from "@/components/desktop/DesktopChrome";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DESKTOP_VERSION } from "@/lib/desktop";

/**
 * Volledig scherm dat de desktop-app toont wanneer een gratis account inlogt.
 * De Windows-app is inbegrepen vanaf een betaald plan; web en telefoon blijven
 * altijd gratis. De upgrade-link wijst naar de prijzen op de website — de
 * desktop-shell opent marketingpagina's automatisch in de systeembrowser,
 * zodat betalen buiten de app om gaat (bewuste keuze: web-checkout via Mollie).
 */
export async function DesktopGate({ accountType }: { accountType: "ZZP" | "BEDRIJF" }) {
  const t = await getTranslations("desktop.gate");
  const pricingHref = accountType === "BEDRIJF" ? "/bedrijven" : "/zzp";

  const perks = ["window", "everywhere", "upgradeAnytime"] as const;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0A0618] px-6 py-12 text-white">
      <DesktopChrome />
      {/* Sfeergloed */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[-10rem] h-[480px] w-[820px] max-w-[140%] -translate-x-1/2 rounded-full blur-[130px]"
          style={{ background: "radial-gradient(ellipse at center, rgba(124,58,237,0.25), rgba(147,51,234,0.08) 45%, transparent 72%)" }}
        />
      </div>

      <div className="relative w-full max-w-lg text-center">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-2xl font-bold">
            Saldo<span className="text-brand-400">va</span>
          </span>
          <span className="ml-1 rounded-full border border-[#a855f7]/30 bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-200">
            Desktop v{DESKTOP_VERSION}
          </span>
        </div>

        <div className="rounded-3xl border border-[#a855f7]/20 bg-[#16102E] p-8 shadow-[0_0_50px_-12px_rgba(124,58,237,0.4)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-[#a855f7]/25">
            <Icon name="lock" className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#c4b5fd]">{t("body")}</p>

          <ul className="mt-6 space-y-2 text-left">
            {perks.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-sm text-slate-200">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                {t(`perks.${key}`)}
              </li>
            ))}
          </ul>

          {/* Marketing-URL: de shell opent deze in de standaardbrowser */}
          <Link
            href={pricingHref}
            className="mt-7 block rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] transition-all duration-200 hover:bg-brand-500 hover:shadow-[0_0_28px_rgba(124,58,237,0.55)]"
          >
            {t("cta")}
          </Link>
          <p className="mt-3 text-xs text-slate-500">{t("ctaHint")}</p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-sm text-slate-400">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
