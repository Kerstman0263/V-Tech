import { getTranslations } from "next-intl/server";
import type { WebshopPlatform, WebshopStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TodayActions } from "@/components/dashboard/TodayActions";
import type { TodayAction } from "@/lib/today-actions";
import { EU_STANDARD_VAT, ossSummary, periodTotals, quarterOf, quarterRange } from "@/lib/webshop/oss";

const PLATFORM_NAME: Record<WebshopPlatform, string> = { SHOPIFY: "Shopify", WOOCOMMERCE: "WooCommerce", BOLCOM: "Bol.com", CSV: "CSV" };
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Het webshoppaneel: rustig mint, alles draait om de winkel. Bestellingen
 * vandaag en deze maand, verkoop per dag, per kanaal en per land, de
 * OSS-drempel en of je koppelingen nog lopen. Data komt uit de opgeslagen
 * webshop-orders (EUR) — dezelfde bron als de Webshop-pagina.
 */
export async function WebshopDashboard({
  uid,
  locale,
  greeting,
  dateLabel,
  todayActions,
}: {
  uid: string;
  locale: string;
  greeting: string;
  dateLabel: string;
  todayActions: TodayAction[];
}) {
  const t = await getTranslations("dashboard.shop");
  const money = (n: number) => formatMoney(n, locale);
  const now = new Date();
  const year = now.getUTCFullYear();

  const [connections, rows] = await Promise.all([
    db.webshopConnection.findMany({
      where: { userId: uid },
      select: { id: true, name: true, platform: true, status: true, lastSyncAt: true, lastRunAt: true, lastError: true },
      orderBy: { createdAt: "asc" },
    }),
    db.webshopOrder.findMany({
      // Vanaf 1 januari — of in januari vanaf 1 december (vergelijking met vorige maand).
      where: { userId: uid, currency: "EUR", cancelledAt: null, orderDate: { gte: new Date(Date.UTC(year, Math.min(0, now.getUTCMonth() - 1), 1)) } },
      select: { kind: true, orderDate: true, country: true, totalGross: true, vatAmount: true, fees: true, isBusiness: true, connection: { select: { name: true, platform: true } } },
      take: 50_000,
    }),
  ]);

  const orders = rows.map((r) => ({
    kind: r.kind,
    orderDate: iso(r.orderDate),
    country: r.country,
    totalGross: Number(r.totalGross),
    vatAmount: Number(r.vatAmount),
    fees: Number(r.fees),
    isBusiness: r.isBusiness,
    source: r.connection.name,
    platform: r.connection.platform,
  }));

  const today = iso(now);
  const tomorrow = iso(new Date(now.getTime() + DAY));
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthDate = new Date(Date.UTC(year, now.getUTCMonth() - 1, 1));
  const prevMonthStart = iso(prevMonthDate);
  const q = quarterOf(today);
  const [qFrom, qTo] = quarterRange(year, q);

  const todayT = periodTotals(orders, today, tomorrow);
  const monthT = periodTotals(orders, monthStart, tomorrow);
  const prevT = periodTotals(orders, prevMonthStart, monthStart);
  const quarterT = periodTotals(orders, qFrom, qTo);
  const oss = ossSummary(orders.filter((o) => o.orderDate >= `${year}-01-01`), year);
  const monthDelta = prevT.gross > 0 ? ((monthT.gross - prevT.gross) / prevT.gross) * 100 : null;

  // Verkoop per dag, laatste 30 dagen — ook dagen zonder bestellingen.
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = iso(new Date(now.getTime() - (29 - i) * DAY));
    const d = periodTotals(orders, date, iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY)));
    return { date, gross: d.gross, orders: d.orders };
  });
  const maxDay = Math.max(...days.map((d) => d.gross), 1);
  const fmtDay = (s: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`));

  // Kanalen deze maand
  const channels = new Map<string, { name: string; platform: WebshopPlatform; orders: number; gross: number }>();
  for (const o of orders) {
    if (o.orderDate < monthStart) continue;
    const c = channels.get(o.source) ?? { name: o.source, platform: o.platform, orders: 0, gross: 0 };
    if (o.kind === "SALE") { c.orders++; c.gross += o.totalGross; } else c.gross -= o.totalGross;
    channels.set(o.source, c);
  }
  const channelList = [...channels.values()].sort((a, b) => b.gross - a.gross);
  const channelMax = Math.max(...channelList.map((c) => c.gross), 1);

  // Landen dit jaar (NL + EU-landen buiten NL, B2C)
  const countries = [
    ...(oss.domestic.orders > 0 ? [{ country: "NL", orders: oss.domestic.orders, net: oss.domestic.net }] : []),
    ...oss.perCountry.map((c) => ({ country: c.country, orders: c.orders, net: c.net })),
  ]
    .sort((a, b) => b.net - a.net)
    .slice(0, 6);
  const regionName = new Intl.DisplayNames([locale], { type: "region" });

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const ago = (d: Date | null) => {
    if (!d) return t("neverSynced");
    const min = Math.round((d.getTime() - now.getTime()) / 60_000);
    if (Math.abs(min) < 60) return rtf.format(min, "minute");
    const h = Math.round(min / 60);
    if (Math.abs(h) < 48) return rtf.format(h, "hour");
    return rtf.format(Math.round(h / 24), "day");
  };
  const statusTone: Record<WebshopStatus, string> = {
    ACTIVE: "bg-emerald-400",
    ERROR: "bg-rose-400",
    DISCONNECTED: "bg-slate-500",
  };

  const stats: { label: string; value: string; sub: string; icon: IconName; href: string }[] = [
    { label: t("today"), value: money(todayT.gross), sub: t("ordersCount", { count: todayT.orders }), icon: "cart", href: "/webshop" },
    {
      label: t("month"),
      value: money(monthT.gross),
      sub: monthDelta === null ? t("ordersCount", { count: monthT.orders }) : t("vsPrev", { pct: `${monthDelta >= 0 ? "+" : ""}${Math.round(monthDelta)}%` }),
      icon: "trend",
      href: "/webshop",
    },
    { label: t("vatQuarter", { quarter: `Q${q}` }), value: money(quarterT.vat), sub: t("vatQuarterSub"), icon: "euro", href: "/btw" },
    { label: t("fees"), value: money(monthT.fees), sub: t("feesSub", { refunds: monthT.refunds }), icon: "receipt", href: "/expenses" },
  ];

  return (
    <div className="relative">
      <div className="stagger relative flex flex-col gap-6">
        {/* Kop */}
        <div id="tour-welcome" style={{ "--i": 0 } as React.CSSProperties} className="animate-rise flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium capitalize text-brand-300">{dateLabel}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{greeting}</h1>
            <p className="mt-1 text-sm text-slate-400">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/webshop" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all hover:bg-brand-500 hover:shadow-glow-md">
              <Icon name="refresh" className="h-4 w-4" /> {t("syncCta")}
            </Link>
            <Link href="/expenses" className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-white/10">
              + {t("expenseCta")}
            </Link>
          </div>
        </div>

        {/* Nog niets gekoppeld: vriendelijke start */}
        {connections.length === 0 && (
          <Card style={{ "--i": 1 } as React.CSSProperties} className="animate-rise overflow-hidden border-brand-400/25 bg-gradient-to-br from-brand-500/[0.12] to-transparent p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-xl">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-200"><Icon name="store" className="h-5 w-5" /></span>
                <h2 className="mt-4 text-xl font-bold text-white">{t("connectTitle")}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{t("connectSub")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["SHOPIFY", "WOOCOMMERCE", "BOLCOM", "CSV"] as const).map((pl) => (
                    <span key={pl} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-slate-200">{PLATFORM_NAME[pl]}</span>
                  ))}
                </div>
              </div>
              <Link href="/webshop" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-glow transition-all hover:bg-brand-500">
                {t("connectCta")} <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </div>
          </Card>
        )}

        {/* Vier kerncijfers */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Link
              key={s.label}
              href={s.href}
              style={{ "--i": i + 2 } as React.CSSProperties}
              className="group animate-rise rounded-2xl border border-white/[0.06] bg-kaart p-4 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-brand-400/30 sm:p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-slate-400 sm:text-sm">{s.label}</p>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name={s.icon} className="h-4 w-4" /></span>
              </div>
              <p className="tabular mt-2 truncate text-xl font-bold tracking-tight text-white sm:text-2xl">{s.value}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{s.sub}</p>
            </Link>
          ))}
        </div>

        {/* Verkoop per dag + OSS */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card style={{ "--i": 6 } as React.CSSProperties} className="animate-rise p-5 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-white">{t("salesTitle")}</h2>
                <p className="text-xs text-slate-400">{t("salesSub")}</p>
              </div>
              <p className="tabular text-right text-xs text-slate-500">{t("salesTotal", { amount: money(days.reduce((s, d) => s + d.gross, 0)) })}</p>
            </div>
            <div className="mt-5 flex h-44 items-stretch gap-[3px]" role="img" aria-label={t("salesTitle")}>
              {days.map((d) => (
                <div key={d.date} className="group relative flex flex-1 flex-col justify-end" title={`${fmtDay(d.date)} · ${money(d.gross)} · ${t("ordersCount", { count: d.orders })}`}>
                  <div
                    className={cn("w-full rounded-t-md transition-colors", d.date === today ? "bg-brand-300" : "bg-brand-500/50 group-hover:bg-brand-400")}
                    style={{ height: `${d.gross > 0 ? Math.max(4, (d.gross / maxDay) * 100) : 2}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-500">
              <span>{fmtDay(days[0].date)}</span>
              <span>{fmtDay(days[14].date)}</span>
              <span>{t("todayShort")}</span>
            </div>
          </Card>

          <Card style={{ "--i": 7 } as React.CSSProperties} className="animate-rise flex flex-col p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{t("ossTitle")}</h2>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", oss.thresholdExceeded ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300")}>
                {oss.thresholdExceeded ? t("ossOver") : t("ossUnder")}
              </span>
            </div>
            <p className="tabular mt-3 text-3xl font-bold tracking-tight text-white">{money(oss.crossBorderNet)}</p>
            <p className="text-xs text-slate-500">{t("ossOf", { threshold: money(oss.threshold) })}</p>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn("h-full rounded-full", oss.thresholdPct >= 100 ? "bg-amber-400" : oss.thresholdPct >= 75 ? "bg-gradient-to-r from-brand-400 to-amber-400" : "bg-gradient-to-r from-brand-500 to-brand-300")}
                style={{ width: `${Math.min(100, oss.thresholdPct)}%` }}
              />
            </div>
            <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">{oss.thresholdExceeded ? t("ossOverText") : t("ossUnderText")}</p>
            <Link href="/webshop" className="mt-3 text-xs font-semibold text-brand-300 hover:underline">{t("ossCta")} →</Link>
          </Card>
        </div>

        {/* Kanalen, koppelingen, landen */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card style={{ "--i": 8 } as React.CSSProperties} className="animate-rise p-5">
            <h2 className="font-semibold text-white">{t("channelsTitle")}</h2>
            <p className="text-xs text-slate-500">{t("channelsSub")}</p>
            {channelList.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">{t("channelsEmpty")}</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {channelList.map((c) => (
                  <li key={c.name}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-slate-200">{c.name}</span>
                      <span className="tabular shrink-0 font-semibold text-white">{money(c.gross)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div className="h-full rounded-full bg-brand-400/80" style={{ width: `${Math.max(3, (c.gross / channelMax) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{PLATFORM_NAME[c.platform]} · {t("ordersCount", { count: c.orders })}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card style={{ "--i": 9 } as React.CSSProperties} className="animate-rise p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{t("connTitle")}</h2>
              <Link href="/webshop" className="text-xs font-medium text-brand-300 hover:underline">{t("manage")}</Link>
            </div>
            {connections.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">{t("connEmpty")}</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2.5">
                {connections.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", statusTone[c.status], c.status === "ACTIVE" && "shadow-[0_0_8px] shadow-emerald-400/60")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{c.name}</p>
                      <p className={cn("truncate text-[11px]", c.status === "ERROR" ? "text-rose-300" : "text-slate-500")}>
                        {c.status === "ERROR" && c.lastError ? c.lastError : `${PLATFORM_NAME[c.platform]} · ${t(`status${c.status}`)} · ${ago(c.lastRunAt ?? c.lastSyncAt)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card style={{ "--i": 10 } as React.CSSProperties} className="animate-rise p-5">
            <h2 className="font-semibold text-white">{t("countriesTitle")}</h2>
            <p className="text-xs text-slate-500">{t("countriesSub", { year })}</p>
            {countries.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">{t("channelsEmpty")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-white/[0.04]">
                {countries.map((c) => (
                  <li key={c.country} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-7 shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-center text-[10px] font-bold text-slate-300">{c.country}</span>
                      <span className="truncate text-slate-200">{regionName.of(c.country) ?? c.country}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {EU_STANDARD_VAT[c.country] !== undefined && <span className="text-[11px] text-slate-500">{EU_STANDARD_VAT[c.country]}%</span>}
                      <span className="tabular font-semibold text-white">{money(c.net)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {todayActions.length > 0 && <TodayActions actions={todayActions} />}
      </div>
    </div>
  );
}
