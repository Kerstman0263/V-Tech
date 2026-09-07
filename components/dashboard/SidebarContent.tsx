"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { PLANS } from "@/lib/plans";
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

// Twee gescheiden panelen: zzp'ers krijgen een administratie-eerst indeling,
// bedrijven een personeel-eerst indeling.
// Zzp-panel: een solo-ondernemer heeft geen Team of Activiteit nodig, en
// gebruikt Uren/Ritten dagelijks — die staan daarom bovenaan bij OVERZICHT.
const SECTIONS_ZZP = [
  { label: "groupOverview", keys: ["dashboard", "time", "mileage", "tasks", "fiscaleRust"] },
  { label: "groupAdmin", keys: ["invoices", "recurring", "quotes", "snelleOfferte", "products", "expenses", "assets", "bank", "vat", "reports", "projects", "customers"] },
  { label: "groupAccount", keys: ["settings", "desktop"] },
] as const;

const SECTIONS_BEDRIJF = [
  { label: "groupOverview", keys: ["dashboard", "fiscaleRust"] },
  // Personeel: iedereen mag hier zijn eigen werk doen (verlof/taken/uren/ritten);
  // team & activiteit alleen voor eigenaar/leidinggevende.
  { label: "groupStaff", keys: ["team", "leave", "tasks", "time", "mileage", "activity"] },
  // Administratie = financieel; alleen zichtbaar met canFinance (eigenaar/admin).
  { label: "groupAdmin", keys: ["invoices", "recurring", "quotes", "snelleOfferte", "products", "expenses", "assets", "bank", "vat", "reports", "projects", "customers"] },
  { label: "groupAccount", keys: ["settings", "desktop"] },
] as const;

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
        <span className="text-lg font-bold text-white">
          Saldo<span className="text-brand-400">va</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden">
        {/* Panel-label: maakt zichtbaar in welk product je werkt.
            Geen negatieve marge — die trok het label boven de rand van de
            scroll-container en knipte het visueel doormidden. */}
        <span className="ml-2 w-fit rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          {isZzp ? t("panelZzp") : t("panelCompany")}
        </span>

        {(isZzp ? SECTIONS_ZZP : SECTIONS_BEDRIJF).map((section) => {
          // De financiële groep (Administratie) is alleen voor de eigenaar/admin.
          if (section.label === "groupAdmin" && !canFinance) return null;
          // Platformbeheerders (OWNER/ADMIN) zien altijd alles — zzp- én bedrijfsfuncties.
          // Daarna: door de gebruiker verborgen modules eruit (menu-voorkeur).
          const keys = section.keys
            .filter((k) =>
              k === "team" || k === "activity" ? mayTeam : k === "leave" ? !isZzp || isAdmin : true,
            )
            .filter((k) => !hidden.includes(k));
          if (keys.length === 0) return null;
          return (
            <div key={section.label}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {t(section.label)}
              </p>
              <div className="flex flex-col gap-1">{keys.map(renderLink)}</div>
            </div>
          );
        })}

        {isAdmin && (
          <div>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("admin")}</p>
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
      <div className="mt-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/0 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("yourPlan")}</p>
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
