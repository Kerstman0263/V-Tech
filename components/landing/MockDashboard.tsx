"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";

/**
 * Interactief mini-dashboard voor de marketingsite — een nagemaakte weergave
 * van de echte tool (géén screenshot). Je kunt op de zijbalk-items klikken en
 * het hoofdscherm toont per item nep-informatie. Er is GEEN echte navigatie of
 * externe link: alles blijft binnen dit ene component (puur demo).
 *
 * variant "free"     -> zzp-indeling (homepage)
 * variant "business" -> bedrijfsindeling met Team/Verlof (/bedrijven)
 */

type NavItem = { key: string; icon: IconName };
type NavSection = { section: string; items: NavItem[] };

const NAV_FREE: NavSection[] = [
  {
    section: "groupOverview",
    items: [
      { key: "dashboard", icon: "chart" },
      { key: "time", icon: "clock" },
      { key: "mileage", icon: "car" },
      { key: "tasks", icon: "check-circle" },
      { key: "fiscaleRust", icon: "shield" },
    ],
  },
  { section: "groupAdmin", items: [{ key: "invoices", icon: "receipt" }, { key: "quotes", icon: "invoice" }] },
  { section: "groupAccount", items: [{ key: "settings", icon: "settings" }] },
];

const NAV_BUSINESS: NavSection[] = [
  { section: "groupOverview", items: [{ key: "dashboard", icon: "chart" }] },
  {
    section: "groupStaff",
    items: [
      { key: "team", icon: "users" },
      { key: "leave", icon: "sun" },
      { key: "tasks", icon: "check-circle" },
      { key: "time", icon: "clock" },
    ],
  },
  { section: "groupAdmin", items: [{ key: "invoices", icon: "receipt" }] },
  { section: "groupAccount", items: [{ key: "settings", icon: "settings" }] },
];

const CHART = [45, 62, 51, 78, 66, 92];
const AVATARS = ["bg-brand-500", "bg-emerald-500", "bg-amber-500", "bg-sky-500"];

// Kleur per statuslabel.
const STATUS_TONE: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-300",
  approved: "bg-emerald-500/15 text-emerald-300",
  done: "bg-emerald-500/15 text-emerald-300",
  sent: "bg-amber-500/15 text-amber-300",
  pending: "bg-amber-500/15 text-amber-300",
  doing: "bg-amber-500/15 text-amber-300",
  draft: "bg-slate-500/15 text-slate-300",
  todo: "bg-slate-500/15 text-slate-300",
  open: "bg-sky-500/15 text-sky-300",
  billed: "bg-brand-500/15 text-brand-300",
};
const PRIO_TONE: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-300",
  normal: "bg-sky-500/15 text-sky-300",
  low: "bg-slate-500/15 text-slate-300",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tone)}>{children}</span>;
}

function Kpi({ icon, tone, label, value }: { icon: IconName; tone: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-[#12112a]/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-400">{label}</span>
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg", tone)}>
          <Icon name={icon} className="h-3 w-3" />
        </span>
      </div>
      <p className="mt-1.5 text-base font-bold text-white">{value}</p>
    </div>
  );
}

// Compacte tabel voor de detailweergaven.
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-white/[0.05] bg-[#12112a]/60 text-[11px]">{children}</div>;
}
function Row({ children, head = false }: { children: React.ReactNode; head?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2", head ? "bg-white/[0.03] text-[9px] font-semibold uppercase tracking-wide text-slate-500" : "border-t border-white/[0.04]")}>
      {children}
    </div>
  );
}

export function MockDashboard({ variant }: { variant: "free" | "business" }) {
  const t = useTranslations("mock");
  const tn = useTranslations("nav");
  const td = useTranslations("dashboard");
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState("dashboard");

  const isBusiness = variant === "business";
  const nav = isBusiness ? NAV_BUSINESS : NAV_FREE;
  const company = isBusiness ? t("companyBusiness") : t("companyFree");
  const planLabel = isBusiness ? t("planBusiness") : t("planFree");

  const st = (k: string) => t(`status.${k}`);

  // ---- Weergave per menu-item -------------------------------------------
  function View() {
    switch (active) {
      case "time":
        return (
          <Rows>
            <Row head>
              <span className="w-14">{t("cols.date")}</span>
              <span className="flex-1">{t("cols.desc")}</span>
              <span className="w-12 text-right">{t("cols.hours")}</span>
              <span className="w-16 text-right">{t("cols.status")}</span>
            </Row>
            {[
              ["12 jul", "Wireframes homepage", "4,0", "open"],
              ["11 jul", "Klantoverleg Acme", "1,5", "open"],
              ["10 jul", "Ontwikkeling sprint 1", "8,0", "billed"],
            ].map(([d, desc, h, s]) => (
              <Row key={desc}>
                <span className="w-14 text-slate-400">{d}</span>
                <span className="flex-1 truncate text-slate-200">{desc}</span>
                <span className="tabular w-12 text-right font-medium text-white">{h}</span>
                <span className="w-16 text-right"><Badge tone={STATUS_TONE[s]}>{st(s)}</Badge></span>
              </Row>
            ))}
            <Row><span className="flex-1 text-slate-400">{t("totalMonth")}</span><span className="font-bold text-white">13,5 u</span></Row>
          </Rows>
        );
      case "mileage":
        return (
          <Rows>
            <Row head><span className="w-14">{t("cols.date")}</span><span className="flex-1">{t("cols.route")}</span><span className="w-14 text-right">{t("cols.km")}</span></Row>
            {[
              ["12 jul", "Amsterdam → Rotterdam", "78"],
              ["10 jul", "Rotterdam → Utrecht", "62"],
              ["08 jul", "Utrecht → Amsterdam", "40"],
            ].map(([d, r, km]) => (
              <Row key={r}>
                <span className="w-14 text-slate-400">{d}</span>
                <span className="flex-1 truncate text-slate-200">{r}</span>
                <span className="tabular w-14 text-right font-medium text-white">{km} km</span>
              </Row>
            ))}
            <Row><span className="flex-1 text-slate-400">180 km · {t("deductible")}</span><span className="font-bold text-white">€ 41,40</span></Row>
          </Rows>
        );
      case "tasks":
        return (
          <div className="space-y-2">
            {[
              ["Offerte Acme afronden", "high", "doing"],
              ["Factuur 2026-0007 versturen", "normal", "todo"],
              ["BTW-aangifte Q2", "high", "todo"],
              ["Website teksten nakijken", "low", "done"],
            ].map(([task, p, s]) => (
              <div key={task} className="flex items-center gap-2 rounded-xl border border-white/[0.05] bg-[#12112a]/60 px-3 py-2">
                <span className="flex-1 truncate text-[11px] text-slate-200">{task}</span>
                <Badge tone={PRIO_TONE[p]}>{t(`prio.${p}`)}</Badge>
                <Badge tone={STATUS_TONE[s]}>{st(s)}</Badge>
              </div>
            ))}
          </div>
        );
      case "fiscaleRust":
        return (
          <div className="space-y-2">
            <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-600/20 to-transparent p-3">
              <p className="text-[11px] font-semibold text-brand-200">{t("frTitle")}</p>
              <p className="mt-1 text-2xl font-extrabold text-white">€ 3.340</p>
              <p className="text-[10px] text-slate-400">{t("frTotal")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/[0.05] bg-[#12112a]/60 p-3">
                <p className="text-[10px] text-slate-400">{t("frVat")}</p>
                <p className="text-base font-bold text-white">€ 1.240</p>
              </div>
              <div className="rounded-xl border border-white/[0.05] bg-[#12112a]/60 p-3">
                <p className="text-[10px] text-slate-400">{t("frIncome")}</p>
                <p className="text-base font-bold text-white">€ 2.100</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">{t("frCalm")}</p>
          </div>
        );
      case "invoices":
        return (
          <Rows>
            <Row head><span className="w-16">{t("cols.number")}</span><span className="flex-1">{t("cols.customer")}</span><span className="w-16">{t("cols.status")}</span><span className="w-16 text-right">{t("cols.amount")}</span></Row>
            {[
              ["2026-0007", "Acme B.V.", "paid", "€ 1.210"],
              ["2026-0006", "De Vries Design", "sent", "€ 605"],
              ["2026-0005", "Bakker & Zn", "draft", "€ 980"],
            ].map(([nr, c, s, a]) => (
              <Row key={nr}>
                <span className="w-16 font-medium text-brand-400">{nr}</span>
                <span className="flex-1 truncate text-slate-200">{c}</span>
                <span className="w-16"><Badge tone={STATUS_TONE[s]}>{st(s)}</Badge></span>
                <span className="tabular w-16 text-right font-medium text-white">{a}</span>
              </Row>
            ))}
          </Rows>
        );
      case "quotes":
        return (
          <Rows>
            <Row head><span className="w-16">{t("cols.number")}</span><span className="flex-1">{t("cols.customer")}</span><span className="w-16">{t("cols.status")}</span><span className="w-16 text-right">{t("cols.amount")}</span></Row>
            {[
              ["OFF-0012", "Jansen Retail", "sent", "€ 2.400"],
              ["OFF-0011", "Acme B.V.", "approved", "€ 1.150"],
            ].map(([nr, c, s, a]) => (
              <Row key={nr}>
                <span className="w-16 font-medium text-brand-400">{nr}</span>
                <span className="flex-1 truncate text-slate-200">{c}</span>
                <span className="w-16"><Badge tone={STATUS_TONE[s]}>{st(s)}</Badge></span>
                <span className="tabular w-16 text-right font-medium text-white">{a}</span>
              </Row>
            ))}
          </Rows>
        );
      case "settings":
        return (
          <div className="space-y-2">
            {[
              [t("settingsCompany"), company],
              [t("settingsKvk"), "12345678"],
              [t("settingsVat"), "NL001234567B01"],
              [t("settingsEmail"), "hallo@onderneming.nl"],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-[#12112a]/60 px-3 py-2.5 text-[11px]">
                <span className="text-slate-400">{label}</span>
                <span className="font-medium text-white">{val}</span>
              </div>
            ))}
          </div>
        );
      case "team":
        return (
          <div className="space-y-2">
            {[
              ["Sanne Bakker", t("roleManager"), "bg-brand-500"],
              ["Tom de Vries", t("roleMember"), "bg-emerald-500"],
              ["Lisa Jansen", t("roleMember"), "bg-amber-500"],
            ].map(([name, role, c], i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl border border-white/[0.05] bg-[#12112a]/60 px-3 py-2">
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white", c)}>
                  {name.split(" ").map((p) => p[0]).join("")}
                </span>
                <span className="flex-1 text-[11px] font-medium text-slate-200">{name}</span>
                <Badge tone={i === 0 ? "bg-brand-500/15 text-brand-300" : "bg-slate-500/15 text-slate-300"}>{role}</Badge>
              </div>
            ))}
          </div>
        );
      case "leave":
        return (
          <div className="space-y-2">
            <div className="rounded-xl border border-white/[0.05] bg-[#12112a]/60 p-3">
              <p className="text-[10px] text-slate-400">{t("leaveBalance")}</p>
              <p className="text-base font-bold text-white">184 u <span className="text-[10px] font-normal text-slate-500">{t("remaining")}</span></p>
            </div>
            <Rows>
              <Row head><span className="flex-1">{t("cols.member")}</span><span className="w-20">{t("cols.period")}</span><span className="w-16 text-right">{t("cols.status")}</span></Row>
              {[
                ["Tom de Vries", "15–19 jul", "pending"],
                ["Lisa Jansen", "22 jul", "approved"],
              ].map(([n, per, s]) => (
                <Row key={n}>
                  <span className="flex-1 truncate text-slate-200">{n}</span>
                  <span className="w-20 text-slate-400">{per}</span>
                  <span className="w-16 text-right"><Badge tone={STATUS_TONE[s]}>{st(s)}</Badge></span>
                </Row>
              ))}
            </Rows>
          </div>
        );
      default:
        // Dashboard-overzicht
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-[#7c3aed]/25 bg-gradient-to-br from-[#241356] to-[#0d0a20] p-3.5">
              <p className="text-[10px] font-medium text-brand-200">{t("greeting")}</p>
              <p className="text-sm font-bold text-white">{company}</p>
            </div>
            {isBusiness && (
              <div className="rounded-xl border border-white/[0.05] bg-[#12112a]/60 p-3">
                <p className="mb-2 text-[11px] font-semibold text-white">{td("companyToday")}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div><p className="text-[9px] text-slate-400">{td("companyLeavePending")}</p><p className="text-sm font-bold text-white">2</p></div>
                  <div><p className="text-[9px] text-slate-400">{td("companyOpenTasks")}</p><p className="text-sm font-bold text-white">7</p></div>
                  <div>
                    <p className="mb-0.5 text-[9px] text-slate-400">{td("companyTeam")}</p>
                    <div className="flex -space-x-1.5">{AVATARS.map((c, i) => <span key={i} className={cn("h-5 w-5 rounded-full border-2 border-[#12112a]", c)} />)}</div>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Kpi icon="euro" tone="bg-emerald-500/10 text-emerald-400" label={td("kpiRevenue")} value="€ 4.250" />
              <Kpi icon="send" tone="bg-amber-500/10 text-amber-400" label={td("kpiOpen")} value="€ 1.815" />
              <Kpi icon="clock" tone="bg-teal-500/10 text-teal-400" label={td("kpiHours")} value="12,5 u" />
              <Kpi icon="car" tone="bg-brand-500/10 text-brand-300" label={td("kpiKm")} value="340 km" />
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-[#12112a]/60 p-3">
              <p className="mb-2 text-[11px] font-semibold text-white">{td("revenueTitle")}</p>
              <div className="flex h-16 items-end gap-1.5">
                {CHART.map((h, i) => <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${h}%` }} />)}
              </div>
            </div>
          </div>
        );
    }
  }

  return (
    <div className="card-glass overflow-hidden shadow-2xl shadow-black/40">
      {/* Nep-browserbalk */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </span>
        <span className="ml-2 flex-1 truncate rounded-md bg-white/[0.04] px-3 py-1 text-center text-[11px] text-slate-500">
          app.saldova.nl/{active === "dashboard" ? "dashboard" : active}
        </span>
        <span className="rounded-full border border-brand-400/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-300">{t("preview")}</span>
      </div>

      {/* Dashboard-body */}
      <div className="relative flex h-[440px] select-none bg-[#080711] text-slate-200">
        {/* Zijbalk — klikbaar */}
        <aside
          className={cn(
            "flex shrink-0 flex-col gap-4 overflow-hidden border-r border-white/5 bg-gradient-to-b from-ink-900 to-ink-950 transition-all duration-300 ease-out",
            open ? "w-44 p-3 sm:w-52 sm:p-4" : "w-0 p-0",
          )}
        >
          <div className="flex items-center gap-2 px-1">
            <Logo className="h-5 w-5" />
            <span className="text-sm font-bold text-white">Saldo<span className="text-brand-400">va</span></span>
          </div>
          <span className="ml-1 w-fit rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300">
            {isBusiness ? tn("panelCompany") : tn("panelZzp")}
          </span>

          <nav className="scrollbar-brand flex flex-1 flex-col gap-3 overflow-y-auto">
            {nav.map((sec) => (
              <div key={sec.section}>
                <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{tn(sec.section)}</p>
                <div className="flex flex-col gap-0.5">
                  {sec.items.map((item) => {
                    const isActive = active === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActive(item.key)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium transition-all duration-150",
                          isActive ? "bg-brand-600 text-white shadow-glow-md" : "text-slate-400 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <Icon name={item.icon} className="h-3.5 w-3.5" />
                        <span className="truncate">{tn(item.key)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{tn("yourPlan")}</p>
            <p className="text-xs font-semibold text-white">{planLabel}</p>
          </div>
        </aside>

        {/* Hoofdvlak */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={t("toggle")}
                aria-expanded={open}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <span className="text-xs font-semibold text-white">{tn(active)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[10px] text-slate-500 sm:block">{t("hint")}</span>
              <span className="h-6 w-6 rounded-full bg-brand-600 text-center text-[10px] font-bold leading-6 text-white">
                {company.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Weergave voor het gekozen menu-item */}
          <div className="scrollbar-brand flex-1 overflow-y-auto p-4">
            <View />
          </div>
        </div>
      </div>
    </div>
  );
}
