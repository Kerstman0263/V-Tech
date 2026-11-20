import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SaldovaLogo } from "@/components/ui/SaldovaLogo";
import { cn } from "@/lib/utils";
import { HelpHub } from "@/components/landing/HelpHub";
import { OvaBlock } from "@/components/landing/OvaBlock";
import { CompanyDetails } from "@/components/company/CompanyDetails";

// Gedeelde marketing-footer. `light` schakelt naar het lichte thema (home).
export function SiteFooter({ light = false }: { light?: boolean }) {
  const t = useTranslations("landing");
  const tn = useTranslations("landing.nav");

  const head = cn("text-sm font-semibold", light ? "text-slate-900" : "text-white");
  const list = cn("mt-3 flex flex-col gap-2 text-sm", light ? "text-slate-500" : "text-slate-400");
  const link = cn(
    "rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saldova-licht",
    light ? "hover:text-slate-900" : "hover:text-white",
  );

  return (
    <footer className={cn("border-t", light ? "border-slate-200 bg-slate-50" : "border-rand bg-grond")}>
      <HelpHub />
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <SaldovaLogo
              eiClassName="h-6 w-auto"
              kleur={light ? "text-saldova" : "text-saldova-licht"}
              woordClassName={cn("text-sm", light ? "text-slate-900" : "text-white")}
            />
            <p className={cn("mt-3 max-w-xs text-sm", light ? "text-slate-500" : "text-slate-400")}>{t("footer.tagline")}</p>
            <div className="mt-4 flex items-center gap-3">
              <a
                href="https://instagram.com/saldova.nl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("footer.instagramAria")}
                title="@saldova.nl"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saldova-licht",
                  light ? "border-slate-200 bg-white text-slate-500 hover:border-brand-400/40 hover:text-brand-600" : "border-rand bg-kaart text-slate-300 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <span className={cn("text-sm", light ? "text-slate-500" : "text-slate-400")}>@saldova.nl</span>
            </div>
          </div>

          <div>
            <h4 className={head}>{t("footer.product")}</h4>
            <ul className={list}>
              <li><Link href="/zzp" className={link}>{tn("forFreelancers")}</Link></li>
              <li><Link href="/webshops" className={link}>{tn("forWebshops")}</Link></li>
              <li><Link href="/zzp#pricing" className={link}>{tn("pricing")}</Link></li>
              <li><Link href="/faq" className={link}>{tn("faq")}</Link></li>
              <li><Link href="/overstappen" className={link}>{tn("switch")}</Link></li>
              <li><Link href="/bedrijven" className={link}>{tn("forCompanies")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className={head}>{t("footer.company")}</h4>
            <ul className={list}>
              <li><Link href="/about" className={link}>{tn("about")}</Link></li>
              <li><Link href="/exportgarantie" className={link}>{tn("exportGuarantee")}</Link></li>
              <li><Link href="/beveiliging" className={link}>{tn("security")}</Link></li>
              <li><Link href="/contact" className={link}>{tn("contact")}</Link></li>
              <li><Link href="/login" className={link}>{tn("login")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className={head}>{t("footer.legal")}</h4>
            <ul className={list}>
              <li><Link href="/legal/privacy" className={link}>{t("footer.privacy")}</Link></li>
              <li><Link href="/legal/terms" className={link}>{t("footer.terms")}</Link></li>
              <li><Link href="/legal/dpa" className={link}>{t("footer.dpa")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10">
          <OvaBlock />
        </div>

        <div className={cn("mt-10 border-t pt-6 text-sm", light ? "border-slate-200 text-slate-500" : "border-rand text-slate-400")}>
          <CompanyDetails variant="compact" light={light} className="mb-3 max-w-3xl" />
          <p className="max-w-3xl text-xs leading-relaxed">{t("footer.disclaimer")}</p>
          <p className="mt-3">© 2026 Saldova. {t("footer.rights")}</p>
        </div>
      </div>
    </footer>
  );
}
