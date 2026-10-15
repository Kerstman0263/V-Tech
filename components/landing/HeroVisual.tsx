import { useTranslations } from "next-intl";
import { MockDashboard } from "@/components/landing/MockDashboard";
import { Icon } from "@/components/ui/Icon";

// Hero-compositie: de dashboard-mockup met drie zwevende "live" kaartjes
// eromheen (betaalde factuur, btw-reservering, webshop-import). Puur visueel;
// de bedragen zijn voorbeeldwaarden, net als in MockDashboard zelf.
export function HeroVisual() {
  const t = useTranslations("home.visual");

  return (
    <div className="relative">
      {/* Gloed onder de mockup */}
      <div aria-hidden className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 rounded-[3rem] bg-brand-600/20 blur-[100px]" />

      <div className="relative">
        <MockDashboard variant="free" switcher framed />
      </div>

      {/* Kaartje 1 — betaalde factuur (linksonder) */}
      <div className="absolute -bottom-6 -left-4 hidden w-60 animate-float glass-float rounded-2xl border border-white/10 bg-[#120d2a]/90 p-4 backdrop-blur-xl sm:block lg:-left-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/20">
            <Icon name="check" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-slate-400">{t("paidLabel")}</p>
            <p className="font-display text-lg font-bold text-white">+ € 1.210,00</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{t("paidMeta")}</p>
      </div>

      {/* Kaartje 2 — btw-reservering (rechtsboven) */}
      <div
        className="absolute -right-4 -top-14 hidden w-56 animate-float glass-float rounded-2xl border border-white/10 bg-[#120d2a]/90 p-4 backdrop-blur-xl md:block lg:-right-10"
        style={{ animationDelay: "-2s" }}
      >
        <p className="text-xs text-slate-400">{t("vatLabel")}</p>
        <p className="mt-0.5 font-display text-lg font-bold text-white">€ 1.815</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400" />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
          <Icon name="check-circle" className="h-3.5 w-3.5" />
          {t("vatReady")}
        </p>
      </div>

      {/* Kaartje 3 — webshop-import (rechtsonder) */}
      <div
        className="absolute -bottom-8 right-6 hidden w-64 animate-float glass-float rounded-2xl border border-white/10 bg-[#120d2a]/90 p-4 backdrop-blur-xl lg:block"
        style={{ animationDelay: "-4s" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/20">
            <Icon name="cart" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-slate-400">{t("shopLabel")}</p>
            <p className="text-sm font-semibold text-white">{t("shopValue")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
