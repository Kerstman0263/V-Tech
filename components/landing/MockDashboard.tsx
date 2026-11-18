"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { OvaEi } from "@/components/ova-ei";

/**
 * Interactief mini-dashboard voor de marketingsite — een nagemaakte weergave
 * van de echte tool (géén screenshot). Je kunt op de zijbalk-items klikken en
 * het hoofdscherm toont per item nep-informatie. Er is GEEN echte navigatie of
 * externe link: alles blijft binnen dit ene component (puur demo).
 *
 * variant "free"     -> zzp-indeling (homepage)
 * variant "shop"     -> webshop-indeling (orders, btw/OSS, inkoop, kosten)
 * variant "business" -> bedrijfsindeling met Team/Verlof (/bedrijven)
 *
 * Met `switcher` staat er een schakelaar boven de mockup (zzp ↔ webshop).
 * De webshop-weergave toont alleen wat de echte app nu al kan.
 */

type Variant = "free" | "shop" | "business";

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

const NAV_SHOP: NavSection[] = [
  { section: "groupHome", items: [{ key: "dashboard", icon: "chart" }] },
  { section: "groupShop", items: [{ key: "webshop", icon: "cart" }, { key: "products", icon: "package" }] },
  {
    section: "groupMoney",
    items: [
      { key: "vat", icon: "globe" },
      { key: "expenses", icon: "receipt" },
      { key: "fiscaleRust", icon: "shield" },
    ],
  },
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

// Omzet per maand (voorbeeld): bruto en wat er na btw + belastingbuffer overblijft.
const MONTHS = ["mei", "jun", "jul", "aug", "sep", "okt"];
const CHART = [
  { gross: 2410, free: 1620 },
  { gross: 3180, free: 2130 },
  { gross: 2690, free: 1800 },
  { gross: 3760, free: 2510 },
  { gross: 3390, free: 2270 },
  { gross: 4250, free: 2844 },
];
const SHOP_DAYS = [38, 52, 44, 61, 58, 73, 49, 66, 81, 70, 64, 92, 77, 85];
const eur = (n: number) => `€ ${n.toLocaleString("nl-NL")}`;
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
    <div className="min-w-0 rounded-xl border border-rand bg-kaart p-2.5">
      {/* Icoon vóór het label en alles mag krimpen: tekst en icoon botsen nooit. */}
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", tone)}>
          <Icon name={icon} className="h-3 w-3" />
        </span>
        <span className="truncate text-[10px] font-medium text-slate-400">{label}</span>
      </div>
      <p className="tabular mt-1.5 truncate text-sm font-bold text-white">{value}</p>
    </div>
  );
}

/** Omzetgrafiek met maandlabels en hover-tooltip (bruto + vrij besteedbaar). */
function RevenueBars({ title, grossLabel, freeLabel }: { title: string; grossLabel: string; freeLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...CHART.map((c) => c.gross));
  return (
    <div className="rounded-xl border border-rand bg-kaart p-3">
      <p className="mb-2 text-[11px] font-semibold text-white">{title}</p>
      <div className="relative flex h-20 items-end gap-1.5" onMouseLeave={() => setHover(null)}>
        {CHART.map((c, i) => (
          <button
            key={MONTHS[i]}
            type="button"
            aria-label={`${MONTHS[i]}: ${eur(c.gross)}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="relative flex h-full flex-1 items-end"
          >
            <span
              className={cn(
                "w-full rounded-t bg-gradient-to-t from-brand-600 to-brand-400 transition-all duration-200",
                hover === i ? "shadow-[0_-4px_14px_rgba(167,139,250,0.6)] brightness-125" : "shadow-[0_-2px_8px_rgba(167,139,250,0.25)]",
              )}
              style={{ height: `${(c.gross / max) * 100}%` }}
            />
          </button>
        ))}
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-rand bg-kaart px-2.5 py-1.5 text-[10px] shadow-xl"
            style={{ left: `${Math.min(80, Math.max(20, ((hover + 0.5) / CHART.length) * 100))}%` }}
          >
            <p className="font-semibold capitalize text-white">{MONTHS[hover]}</p>
            <p className="text-slate-400">{grossLabel}: <span className="font-semibold text-white">{eur(CHART[hover].gross)}</span></p>
            <p className="text-slate-400">{freeLabel}: <span className="font-semibold text-emerald-300">{eur(CHART[hover].free)}</span></p>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {MONTHS.map((m, i) => (
          <span key={m} className={cn("flex-1 text-center text-[9px] capitalize", hover === i ? "text-brand-300" : "text-slate-400")}>{m}</span>
        ))}
      </div>
    </div>
  );
}

/** "Vrij besteedbaar": de omzet opgesplitst in wat écht van jou is, btw en buffer. */
function SafeToSpend({ t }: { t: (k: string) => string }) {
  // Voorbeeld: € 4.250 omzet incl. 21% btw → btw € 737,60; buffer IB/Zvw € 668.
  const parts = [
    { key: "free", amount: 2844, cls: "bg-brand-500", dot: "bg-brand-400" },
    { key: "vat", amount: 738, cls: "bg-sky-400", dot: "bg-sky-400" },
    { key: "tax", amount: 668, cls: "bg-amber-400", dot: "bg-amber-400" },
  ];
  const total = parts.reduce((a, p) => a + p.amount, 0);
  return (
    <div className="rounded-xl border border-brand-500/25 bg-kaart p-3.5">
      <p className="text-[10px] font-medium text-brand-200">{t("safe.title")}</p>
      <p className="tabular mt-0.5 text-2xl font-extrabold tracking-tight text-white">€ 2.844,40</p>
      <div className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => <span key={p.key} className={p.cls} style={{ width: `${(p.amount / total) * 100}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400">
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
            {t(`safe.${p.key}`)} <span className="tabular font-semibold text-slate-200">{eur(p.amount)}</span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] text-slate-400">{t("safe.from")}</p>
    </div>
  );
}

// Compacte tabel voor de detailweergaven.
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-rand bg-kaart text-[11px]">{children}</div>;
}
function Row({ children, head = false }: { children: React.ReactNode; head?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2", head ? "bg-white/[0.03] text-[9px] font-semibold uppercase tracking-wide text-slate-400" : "border-t border-rand")}>
      {children}
    </div>
  );
}

export function MockDashboard({
  variant: initial,
  switcher = false,
  framed = false,
}: {
  variant: Variant;
  switcher?: boolean;
  /** Hero: lijst rond alleen de mockup, schakelaar erboven. */
  framed?: boolean;
}) {
  const t = useTranslations("mock");
  const tn = useTranslations("nav");
  const td = useTranslations("dashboard");
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState("dashboard");
  const [variant, setVariant] = useState<Variant>(initial);

  const isBusiness = variant === "business";
  const isShop = variant === "shop";
  const nav = isBusiness ? NAV_BUSINESS : isShop ? NAV_SHOP : NAV_FREE;
  const switchTo = (v: Variant) => {
    setVariant(v);
    setActive("dashboard");
  };
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
              <div key={task} className="flex items-center gap-2 rounded-xl border border-rand bg-kaart px-3 py-2">
                <span className="flex-1 truncate text-[11px] text-slate-200">{task}</span>
                <Badge tone={PRIO_TONE[p]}>{t(`prio.${p}`)}</Badge>
                <Badge tone={STATUS_TONE[s]}>{st(s)}</Badge>
              </div>
            ))}
          </div>
        );
      case "webshop":
        return (
          <Rows>
            <Row head><span className="w-12">{t("cols.number")}</span><span className="flex-1">{t("shop.channel")}</span><span className="w-9">{t("shop.country")}</span><span className="w-16 text-right">{t("cols.amount")}</span></Row>
            {[
              ["#1048", "Shopify", "NL", "€ 64,95"],
              ["#1047", "Shopify", "DE", "€ 39,90"],
              ["B-2231", "Bol.com", "NL", "€ 24,99"],
              ["#1046", "Shopify", "BE", "€ 89,00"],
            ].map(([nr, ch, c, a]) => (
              <Row key={nr}>
                <span className="w-12 font-medium text-brand-400">{nr}</span>
                <span className="flex-1 truncate text-slate-200">{ch}</span>
                <span className="w-9"><Badge tone="bg-white/[0.06] text-slate-300">{c}</Badge></span>
                <span className="tabular w-16 text-right font-medium text-white">{a}</span>
              </Row>
            ))}
            <Row><span className="flex-1 text-slate-400">{t("shop.synced")}</span><span className="font-semibold text-emerald-300">214</span></Row>
          </Rows>
        );
      case "products":
        return (
          <Rows>
            <Row head><span className="flex-1">{t("shop.product")}</span><span className="w-14 text-right">{t("shop.price")}</span><span className="w-14 text-right">{t("shop.cost")}</span><span className="w-12 text-right">{t("shop.margin")}</span></Row>
            {[
              ["Hoodie Classic", "€ 49,95", "€ 18,40", "54%"],
              ["Mok Saldova", "€ 14,95", "€ 4,10", "67%"],
              ["Tote bag", "€ 19,95", "€ 7,25", "56%"],
            ].map(([p, pr, c, m]) => (
              <Row key={p}>
                <span className="flex-1 truncate text-slate-200">{p}</span>
                <span className="tabular w-14 text-right text-slate-300">{pr}</span>
                <span className="tabular w-14 text-right text-slate-400">{c}</span>
                <span className="w-12 text-right"><Badge tone="bg-emerald-500/15 text-emerald-300">{m}</Badge></span>
              </Row>
            ))}
          </Rows>
        );
      case "vat":
        return (
          <div className="space-y-2">
            <div className="rounded-xl border border-rand bg-kaart p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-400">{t("shop.oss")}</p>
                <Badge tone="bg-emerald-500/15 text-emerald-300">{t("shop.ossUnder")}</Badge>
              </div>
              <p className="tabular mt-1 text-base font-bold text-white">€ 6.240 <span className="text-[10px] font-normal text-slate-400">/ € 10.000</span></p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-[62%] rounded-full bg-gradient-to-r from-brand-500 to-brand-300" /></div>
            </div>
            <Rows>
              <Row head><span className="flex-1">{t("shop.country")}</span><span className="w-10 text-right">%</span><span className="w-16 text-right">{t("shop.vatAmount")}</span></Row>
              {[["Nederland", "21%", "€ 1.512"], ["België", "21%", "€ 402"], ["Duitsland", "19%", "€ 252"]].map(([c, r, v]) => (
                <Row key={c}>
                  <span className="flex-1 text-slate-200">{c}</span>
                  <span className="w-10 text-right text-slate-400">{r}</span>
                  <span className="tabular w-16 text-right font-medium text-white">{v}</span>
                </Row>
              ))}
            </Rows>
          </div>
        );
      case "expenses":
        return (
          <Rows>
            <Row head><span className="flex-1">{t("cols.desc")}</span><span className="w-20">{t("shop.vatAmount")}</span><span className="w-16 text-right">{t("cols.amount")}</span></Row>
            {[
              ["Meta Ads, oktober", "reverse", "€ 1.240"],
              ["TikTok Ads, oktober", "reverse", "€ 480"],
              ["Verpakkingsmateriaal", "21%", "€ 86"],
            ].map(([d, v, a]) => (
              <Row key={d}>
                <span className="flex-1 truncate text-slate-200">{d}</span>
                <span className="w-20"><Badge tone={v === "reverse" ? "bg-sky-500/15 text-sky-300" : "bg-white/[0.06] text-slate-300"}>{v === "reverse" ? t("shop.reverse") : v}</Badge></span>
                <span className="tabular w-16 text-right font-medium text-white">{a}</span>
              </Row>
            ))}
          </Rows>
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
              <div className="rounded-xl border border-rand bg-kaart p-3">
                <p className="text-[10px] text-slate-400">{t("frVat")}</p>
                <p className="text-base font-bold text-white">€ 1.240</p>
              </div>
              <div className="rounded-xl border border-rand bg-kaart p-3">
                <p className="text-[10px] text-slate-400">{t("frIncome")}</p>
                <p className="text-base font-bold text-white">€ 2.100</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">{t("frCalm")}</p>
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
              <div key={label} className="flex items-center justify-between rounded-xl border border-rand bg-kaart px-3 py-2.5 text-[11px]">
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
              <div key={i} className="flex items-center gap-2.5 rounded-xl border border-rand bg-kaart px-3 py-2">
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
            <div className="rounded-xl border border-rand bg-kaart p-3">
              <p className="text-[10px] text-slate-400">{t("leaveBalance")}</p>
              <p className="text-base font-bold text-white">184 u <span className="text-[10px] font-normal text-slate-400">{t("remaining")}</span></p>
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
            {isShop ? (
              <div className="grid grid-cols-2 gap-2">
                <Kpi icon="trend" tone="bg-emerald-500/10 text-emerald-400" label={t("shop.kpiRevenue")} value="€ 12.480" />
                <Kpi icon="cart" tone="bg-brand-500/10 text-brand-300" label={t("shop.kpiOrders")} value="214" />
                <Kpi icon="euro" tone="bg-sky-500/10 text-sky-300" label={t("shop.kpiVat")} value="€ 2.166" />
                <Kpi icon="receipt" tone="bg-amber-500/10 text-amber-400" label={t("shop.kpiFees")} value="€ 412" />
              </div>
            ) : isBusiness ? (
              <div className="rounded-xl border border-brand-500/25 bg-kaart p-3.5">
                <p className="text-[10px] font-medium text-brand-200">{t("greeting")}</p>
                <p className="text-sm font-bold text-white">{company}</p>
              </div>
            ) : (
              <SafeToSpend t={t} />
            )}
            {isBusiness && (
              <div className="rounded-xl border border-rand bg-kaart p-3">
                <p className="mb-2 text-[11px] font-semibold text-white">{td("companyToday")}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div><p className="text-[9px] text-slate-400">{td("companyLeavePending")}</p><p className="text-sm font-bold text-white">2</p></div>
                  <div><p className="text-[9px] text-slate-400">{td("companyOpenTasks")}</p><p className="text-sm font-bold text-white">7</p></div>
                  <div>
                    <p className="mb-0.5 text-[9px] text-slate-400">{td("companyTeam")}</p>
                    <div className="flex -space-x-1.5">{AVATARS.map((c, i) => <span key={i} className={cn("h-5 w-5 rounded-full border-2 border-kaart", c)} />)}</div>
                  </div>
                </div>
              </div>
            )}
            {isShop ? (
              <div className="rounded-xl border border-rand bg-kaart p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-semibold text-white">{t("shop.salesTitle")}</p>
                  <span className="flex shrink-0 items-center gap-1 text-[9px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t("shop.syncedAgo")}</span>
                </div>
                <div className="flex h-16 items-end gap-1">
                  {SHOP_DAYS.map((h, i) => <span key={i} className={cn("flex-1 rounded-t", i === SHOP_DAYS.length - 1 ? "bg-brand-300" : "bg-brand-500/55")} style={{ height: `${h}%` }} />)}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Kpi icon="euro" tone="bg-emerald-500/10 text-emerald-400" label={td("kpiRevenue")} value="€ 4.250" />
                  <Kpi icon="send" tone="bg-amber-500/10 text-amber-400" label={td("kpiOpen")} value="€ 1.815" />
                  <Kpi icon="clock" tone="bg-teal-500/10 text-teal-400" label={td("kpiHours")} value="12,5 u" />
                  <Kpi icon="car" tone="bg-brand-500/10 text-brand-300" label={td("kpiKm")} value="340 km" />
                </div>
                <RevenueBars title={td("revenueTitle")} grossLabel={t("chartGross")} freeLabel={t("chartFree")} />
              </>
            )}
          </div>
        );
    }
  }

  return (
    <div>
      {switcher && (
        <div role="tablist" aria-label={t("mode.label")} className="mb-4 flex w-fit gap-1 rounded-full border border-rand bg-kaart p-1">
          {(["free", "shop"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={variant === v}
              onClick={() => switchTo(v)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 sm:px-4",
                variant === v ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white",
              )}
            >
              <Icon name={v === "free" ? "briefcase" : "store"} className="h-3.5 w-3.5" />
              {t(`mode.${v}`)}
            </button>
          ))}
        </div>
      )}
      <div className={framed ? "relative overflow-hidden rounded-2xl border border-rand bg-kaart p-1.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]" : undefined}>
    <div className={cn("card-glass overflow-hidden shadow-2xl shadow-black/40", framed && "rounded-xl")}>
      {/* Nep-browserbalk */}
      <div className="flex items-center gap-2 border-b border-rand bg-kaart px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </span>
        <span className="ml-2 flex-1 truncate rounded-md bg-white/[0.04] px-3 py-1 text-center text-[11px] text-slate-400">
          saldova.vercel.app/{active === "dashboard" ? "dashboard" : active}
        </span>
        <span className="rounded-full border border-brand-400/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-300">{t("preview")}</span>
      </div>

      {/* Dashboard-body */}
      <div className="relative flex h-[440px] select-none bg-grond text-slate-200">
        {/* Zijbalk — klikbaar */}
        <aside
          className={cn(
            "flex shrink-0 flex-col gap-4 overflow-hidden border-r border-rand bg-kaart transition-all duration-300 ease-out",
            open ? "w-44 p-3 sm:w-52 sm:p-4" : "w-0 p-0",
          )}
        >
          <div className="flex items-center gap-2 px-1">
            <OvaEi merk="saldova" titel="Saldova" className="h-5 w-auto" />
          </div>
          <span className="ml-1 w-fit rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300">
            {isBusiness ? tn("panelCompany") : isShop ? tn("panel.webshop.sub") : tn("panelZzp")}
          </span>

          <nav className="scrollbar-brand flex flex-1 flex-col gap-3 overflow-y-auto">
            {nav.map((sec) => (
              <div key={sec.section}>
                <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{tn(sec.section)}</p>
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
                          isActive ? "bg-brand-600 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
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
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{tn("yourPlan")}</p>
            <p className="text-xs font-semibold text-white">{planLabel}</p>
          </div>
        </aside>

        {/* Hoofdvlak */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-rand px-4 py-2.5">
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
              <span className="hidden text-[10px] text-slate-400 sm:block">{t("hint")}</span>
              <span className="h-6 w-6 rounded-full bg-brand-600 text-center text-[10px] font-bold leading-6 text-white">
                {company.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Weergave voor het gekozen menu-item */}
          <div key={`${variant}-${active}`} className="scrollbar-brand flex-1 animate-rise overflow-y-auto p-4">
            <View />
          </div>
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}
