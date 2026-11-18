"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { Woordmerk } from "@/components/ova-ei";
import { PLANS } from "@/lib/plans";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Panel } from "@/lib/panel";
import type { Plan } from "@prisma/client";

// Strakke line-iconen (Lucide-stijl) per menu-item.
// Ook gebruikt door de CommandPalette (Ctrl+K) voor consistente iconen.
export function NavIcon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "dashboard":
      return (<svg {...common}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>);
    case "tasks":
      return (<svg {...common}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M9 4h6v3H9z" /><path d="M8.5 12l2 2 4-4" /></svg>);
    case "fiscaleRust":
      return (<svg {...common}><path d="M12 2v2" /><path d="M3 11a9 9 0 0 1 18 0z" /><path d="M12 11v7a2 2 0 0 0 4 0" /></svg>);
    case "invoices":
      return (<svg {...common}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5M9.5 17h5" /></svg>);
    case "quotes":
      return (<svg {...common}><path d="M6 2h9l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" /><path d="M14 2v5h5" /><path d="M8.5 14l2 2 4-4" /></svg>);
    case "snelleOfferte":
      return (<svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case "time":
      return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>);
    case "leave":
      return (<svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M9.5 15.5l2 2 3.5-3.5" /></svg>);
    case "expenses":
      return (<svg {...common}><path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22z" /><path d="M9 7h6M9 11h6M9 15h4" /></svg>);
    case "bank":
      return (<svg {...common}><path d="M3 10l9-6 9 6" /><path d="M4 10v9M9 10v9M15 10v9M20 10v9" /><path d="M2 21h20" /></svg>);
    case "webshop":
      return (<svg {...common}><path d="M4 9.5L5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0a2.7 2.7 0 0 0 5.4 0a2.7 2.7 0 0 0 5.3 0" /><path d="M5 11.5V20h14v-8.5" /><path d="M10 20v-5h4v5" /></svg>);
    case "vat":
      return (<svg {...common}><path d="M19 5L5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></svg>);
    case "activity":
      return (<svg {...common}><path d="M3 12h4l2.5-7 5 14 2.5-7h4" /></svg>);
    case "mileage":
      return (<svg {...common}><path d="M5 13l1.6-4.5a2 2 0 0 1 1.9-1.3h7a2 2 0 0 1 1.9 1.3L19 13" /><path d="M4 13h16v4H4z" /><circle cx="7.5" cy="17.5" r="1.4" /><circle cx="16.5" cy="17.5" r="1.4" /></svg>);
    case "projects":
      return (<svg {...common}><path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></svg>);
    case "customers":
      return (<svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8" /><path d="M20.5 20a5.5 5.5 0 0 0-4-5.3" /></svg>);
    case "team":
      return (<svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M18 7v6M21 10h-6" /></svg>);
    case "settings":
      return (<svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>);
    case "products":
      return (<svg {...common}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>);
    case "recurring":
      return (<svg {...common}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>);
    case "assets":
      return (<svg {...common}><path d="M21 8l-9-4-9 4 9 4 9-4z" /><path d="M3 8v8l9 4 9-4V8" /><path d="M12 12v8" /></svg>);
    case "reports":
      return (<svg {...common}><path d="M3 21h18" /><rect x="5" y="11" width="3" height="7" rx="0.5" /><rect x="10.5" y="6" width="3" height="12" rx="0.5" /><rect x="16" y="3" width="3" height="15" rx="0.5" /></svg>);
    case "desktop":
      return (<svg {...common}><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>);
    case "admin":
      return (<svg {...common}><path d="M12 3l8 3v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /></svg>);
    default:
      return null;
  }
}

// Drie losse panelen, elk met een eigen indeling — geen zzp-scherm met
// extra blokjes. Per panel staat bovenaan wat je dagelijks doet; de rest zit
// rustig weggeklapt onder "Meer".
type Section = { label: string; keys: readonly string[]; collapsible?: boolean };

const SECTIONS: Record<Panel, Section[]> = {
  // Zzp: verdienen → werk → belasting. Uren/ritten dagelijks, dus vooraan.
  zzp: [
    { label: "groupHome", keys: ["dashboard"] },
    { label: "groupEarn", keys: ["invoices", "quotes", "customers", "projects"] },
    { label: "groupWork", keys: ["time", "mileage", "tasks"] },
    { label: "groupTax", keys: ["fiscaleRust", "vat", "expenses", "bank"] },
    { label: "groupMore", keys: ["recurring", "snelleOfferte", "products", "assets", "reports"], collapsible: true },
  ],
  // Webshop: de winkel eerst, dan geld & btw (OSS). Uren/ritten zelden nodig.
  webshop: [
    { label: "groupHome", keys: ["dashboard"] },
    { label: "groupShop", keys: ["webshop", "products", "customers"] },
    { label: "groupMoney", keys: ["vat", "fiscaleRust", "expenses", "bank", "invoices"] },
    { label: "groupMore", keys: ["quotes", "recurring", "reports", "assets", "time", "mileage", "projects", "tasks"], collapsible: true },
  ],
  // Mkb: alleen wat een bedrijf met personeel echt gebruikt. Team eerst,
  // financiën alleen voor eigenaar/boekhouder (canFinance).
  bedrijf: [
    { label: "groupHome", keys: ["dashboard"] },
    { label: "groupTeam", keys: ["team", "leave", "time", "tasks"] },
    { label: "groupFinance", keys: ["invoices", "quotes", "customers", "projects", "expenses", "bank", "vat", "reports"] },
    { label: "groupMore", keys: ["recurring", "products", "mileage", "assets", "fiscaleRust", "webshop", "activity"], collapsible: true },
  ],
};

// Financiële modules: alleen voor de account-eigenaar/admin/boekhouder.
const FINANCE_KEYS = new Set(["invoices", "quotes", "customers", "projects", "expenses", "bank", "vat", "reports", "recurring", "snelleOfferte", "products", "assets", "fiscaleRust", "webshop"]);

const PANEL_META: Record<Panel, { icon: IconName; tone: string }> = {
  zzp: { icon: "user", tone: "from-brand-500/25 to-fuchsia-500/10" },
  webshop: { icon: "store", tone: "from-brand-500/25 to-emerald-400/10" },
  bedrijf: { icon: "building", tone: "from-brand-500/25 to-cyan-400/10" },
};

const HREF: Record<string, string> = {
  dashboard: "/dashboard",
  tasks: "/tasks",
  fiscaleRust: "/fiscale-rust",
  invoices: "/invoices",
  quotes: "/quotes",
  snelleOfferte: "/snelle-offerte",
  time: "/time",
  leave: "/verlof",
  expenses: "/expenses",
  bank: "/bank",
  webshop: "/webshop",
  vat: "/btw",
  activity: "/activiteit",
  mileage: "/mileage",
  projects: "/projects",
  customers: "/customers",
  team: "/team",
  settings: "/settings",
  desktop: "/desktop",
  products: "/products",
  recurring: "/recurring",
  assets: "/assets",
  reports: "/reports",
};

export function SidebarContent({
  isAdmin = false,
  isOwner = true,
  canTeam,
  isZzp = true,
  panel,
  canFinance = true,
  plan = "FREE",
  trialDaysLeft = null,
  hidden = [],
  newKeys = [],
  anchorIds = false,
  onNavigate,
}: {
  isAdmin?: boolean;
  /** Echte account-eigenaar — bepaalt o.a. het upgrade-blok. */
  isOwner?: boolean;
  /** Mag team/activiteit zien (eigenaar of leidinggevende). Default: isOwner. */
  canTeam?: boolean;
  isZzp?: boolean;
  /** Welk product (bepaalt menu + kleur). Default: afgeleid van isZzp. */
  panel?: Panel;
  canFinance?: boolean;
  plan?: Plan;
  /** Resterende proefdagen (bedrijven in proefperiode), anders null. */
  trialDaysLeft?: number | null;
  /** Door de gebruiker verborgen modules (menu-voorkeur uit Instellingen). */
  hidden?: string[];
  /** Menu-items met een "Nieuw"-label (functie jonger dan 30 dagen). */
  newKeys?: string[];
  /** Zet `id="menu-<key>"` op de links (ankers voor de productrondleiding).
   *  Alleen de DESKTOP-zijbalk doet dit — de mobiele drawer rendert dezelfde
   *  links en zou anders dubbele ids in de DOM zetten. */
  anchorIds?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const tp = useTranslations("pricing");
  const pathname = usePathname();
  const mayTeam = canTeam ?? isOwner;
  const activePanel: Panel = panel ?? (isZzp ? "zzp" : "bedrijf");
  const meta = PANEL_META[activePanel];

  const renderLink = (key: string) => {
    const href = HREF[key];
    const active = pathname.startsWith(href);
    return (
      <Link
        key={key}
        id={anchorIds ? `menu-${key}` : undefined}
        href={href}
        onClick={onNavigate}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ease-in-out",
          active
            ? "bg-brand-600 text-white shadow-glow-md"
            : "text-slate-400 hover:translate-x-0.5 hover:bg-white/5 hover:text-white",
        )}
      >
        {active && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r bg-white/90" style={{ width: 3 }} />}
        <span className="transition-transform duration-200 group-hover:scale-110">
          <NavIcon name={key} />
        </span>
        {t(key)}
        {newKeys.includes(key) && (
          <span className={cn("ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", active ? "bg-white/20 text-white" : "bg-brand-500/20 text-brand-200")}>
            {t("newBadge")}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Logo -> terug naar de website */}
      <Link
        href="/"
        onClick={onNavigate}
        title={t("toWebsite")}
        className="mb-6 flex items-center gap-2 rounded-lg px-2 py-2 transition-opacity hover:opacity-80"
      >
        <Logo className="h-[25px] w-[25px]" />
        <Woordmerk naam="Saldova" kleur="text-saldova-licht" className="text-[15px] text-white" />
      </Link>

      <nav className="-mr-2 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden pr-2 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)] pb-4">
        {/* Paneel-kaart: in één oogopslag zie je in welk product je werkt. */}
        <div className={cn("flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-gradient-to-br p-3", meta.tone)}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/25">
            <Icon name={meta.icon} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{t(`panel.${activePanel}.title`)}</span>
            <span className="block truncate text-[11px] text-slate-400">{t(`panel.${activePanel}.sub`)}</span>
          </span>
        </div>

        {SECTIONS[activePanel].map((section) => {
          // Platformbeheerders (OWNER/ADMIN) zien altijd alles.
          // Daarna: door de gebruiker verborgen modules eruit (menu-voorkeur).
          const keys = section.keys
            .filter((k) => (FINANCE_KEYS.has(k) ? canFinance : true))
            .filter((k) => (k === "team" || k === "activity" ? mayTeam : true))
            .filter((k) => !hidden.includes(k));
          if (keys.length === 0) return null;
          if (section.collapsible) {
            return <MoreSection key={section.label} label={t(section.label)} keys={keys} renderLink={renderLink} pathname={pathname} />;
          }
          return (
            <div key={section.label}>
              {section.label !== "groupHome" && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t(section.label)}</p>
              )}
              <div className="flex flex-col gap-0.5">{keys.map(renderLink)}</div>
            </div>
          );
        })}

        {/* Account */}
        <div className="flex flex-col gap-0.5">{["settings", "desktop"].filter((k) => !hidden.includes(k)).map(renderLink)}</div>

        {isAdmin && (
          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("admin")}</p>
            <div className="flex flex-col gap-1">
              <Link
                href="/admin"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ease-in-out",
                  pathname.startsWith("/admin") && !pathname.startsWith("/admin/logs") ? "bg-brand-600 text-white shadow-glow-md" : "text-slate-400 hover:translate-x-0.5 hover:bg-white/5 hover:text-white",
                )}
              >
                <NavIcon name="admin" />
                {t("admin")}
              </Link>
              <Link
                href="/admin/logs"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ease-in-out",
                  pathname.startsWith("/admin/logs") ? "bg-brand-600 text-white shadow-glow-md" : "text-slate-400 hover:translate-x-0.5 hover:bg-white/5 hover:text-white",
                )}
              >
                <NavIcon name="activity" />
                {t("adminLogs")}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Plan-badge */}
      <div className="mt-3 shrink-0 rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/0 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("yourPlan")}</p>
        <p className="mt-0.5 font-semibold text-white">{tp(`plans.${PLANS[plan].key}.name`)}</p>
        {trialDaysLeft !== null && (
          <p className={cn("mt-1 w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold", trialDaysLeft <= 3 ? "bg-amber-500/15 text-amber-200" : "bg-brand-500/15 text-brand-200")}>
            {t("trialBadge", { days: Math.max(0, trialDaysLeft) })}
          </p>
        )}
        {isOwner && plan !== "BUSINESS_PLUS" && (
          <Link
            href="/settings"
            onClick={onNavigate}
            className="mt-2 block rounded-lg bg-brand-600 px-3 py-1.5 text-center text-xs font-semibold text-white shadow-glow transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md"
          >
            {t("upgrade")}
          </Link>
        )}
      </div>
    </>
  );
}

/** "Meer"-groep: standaard ingeklapt (rustig menu), klapt vanzelf open als
 *  je op een van de pagina's erin staat. */
function MoreSection({ label, keys, renderLink, pathname }: { label: string; keys: string[]; renderLink: (k: string) => React.ReactNode; pathname: string }) {
  const containsActive = keys.some((k) => pathname.startsWith(HREF[k]));
  const [open, setOpen] = useState(containsActive);
  const isOpen = open || containsActive;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-lg px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-300"
      >
        {label}
        <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {isOpen && <div className="flex flex-col gap-0.5">{keys.map(renderLink)}</div>}
    </div>
  );
}
