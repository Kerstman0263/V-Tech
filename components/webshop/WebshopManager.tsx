"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Icon } from "@/components/ui/Icon";
import { parseOrderCsv, type CsvOrderResult } from "@/lib/webshop/csv";
import type { OssSummary, DayTotal, PeriodTotals } from "@/lib/webshop/oss";

type Platform = "SHOPIFY" | "WOOCOMMERCE" | "BOLCOM" | "CSV";

interface Connection {
  id: string;
  platform: Platform;
  name: string;
  shopUrl: string | null;
  status: "ACTIVE" | "ERROR" | "DISCONNECTED";
  lastSyncAt: string | null;
  lastError: string | null;
  orderCount: number;
}

interface Overview {
  year: number;
  quarter: number;
  totals: PeriodTotals;
  oss: OssSummary;
  days: DayTotal[];
  sources: { source: string; orders: number; gross: number }[];
  otherCurrency: number;
}

const PLATFORM_LABEL: Record<Platform, string> = { SHOPIFY: "Shopify", WOOCOMMERCE: "WooCommerce", BOLCOM: "Bol.com", CSV: "CSV" };

const inputCls = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === "string" ? data.error : fallback;
}

export function WebshopManager({ canConnect }: { canConnect: boolean }) {
  const t = useTranslations("webshop");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, locale);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [adding, setAdding] = useState<Platform | "choose" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, o] = await Promise.all([
      fetch("/api/webshop/connections"),
      fetch(`/api/webshop/overview?year=${year}&quarter=${quarter}`),
    ]);
    if (c.ok) setConnections(await c.json());
    if (o.ok) setOverview(await o.json());
    if (!c.ok || !o.ok) setError(t("loadError"));
  }, [year, quarter, t]);
  useEffect(() => { void load().catch(() => setError(t("loadError"))); }, [load, t]);

  async function sync(conn: Connection) {
    setBusy(conn.id); setError(null); setInfo(null);
    try {
      const res = await fetch(`/api/webshop/connections/${conn.id}/sync`, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, t("syncError")));
      const data = await res.json();
      setInfo(data.hasMore ? t("syncedMore", { count: data.imported }) : t("synced", { count: data.imported }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("syncError"));
    } finally {
      setBusy(null);
      await load().catch(() => undefined);
    }
  }

  async function disconnect(conn: Connection) {
    if (!confirm(t("disconnectConfirm", { name: conn.name }))) return;
    setBusy(conn.id); setError(null); setInfo(null);
    const res = await fetch(`/api/webshop/connections/${conn.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) { setError(await readError(res, t("actionError"))); return; }
    setInfo(t("disconnected"));
    await load().catch(() => undefined);
  }

  const active = connections.filter((c) => c.status !== "DISCONNECTED" || c.orderCount > 0);
  const quarters = [0, 1, 2, 3, 4];
  const years = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <div className="space-y-6">
      {!canConnect && (
        <Card className="flex flex-col gap-4 border-brand-400/30 bg-gradient-to-br from-brand-600/15 to-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200"><Icon name="store" className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold text-white">{t("upsellTitle")}</p>
              <p className="mt-1 text-sm text-slate-400">{t("upsellDesc")}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/webshops" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5">{t("upsellMore")}</Link>
            <Link href="/settings" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow hover:bg-brand-500">{t("upsellCta")}</Link>
          </div>
        </Card>
      )}

      {(info || error) && (
        <p role="status" className={cn("rounded-xl border px-4 py-3 text-sm", error ? "border-rose-500/20 bg-rose-500/[0.08] text-rose-300" : "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300")}>
          {error ?? info}
        </p>
      )}

      {/* Periodekeuze */}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t("year")} value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-400/60 focus:outline-none">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1" role="group" aria-label={t("period")}>
          {quarters.map((q) => (
            <button
              key={q}
              onClick={() => setQuarter(q)}
              aria-pressed={quarter === q}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors", quarter === q ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white")}
            >
              {q === 0 ? t("wholeYear") : `Q${q}`}
            </button>
          ))}
        </div>
      </div>

      {/* KPI's */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("kpi.revenue")} value={money(overview?.totals.gross ?? 0)} icon="euro" sub={t("kpi.revenueSub", { net: money(overview?.totals.net ?? 0) })} />
        <StatCard label={t("kpi.vat")} value={money(overview?.totals.vat ?? 0)} icon="receipt" tone="amber" />
        <StatCard label={t("kpi.orders")} value={String(overview?.totals.orders ?? 0)} icon="cart" tone="green" sub={t("kpi.refunds", { count: overview?.totals.refunds ?? 0 })} />
        <StatCard label={t("kpi.fees")} value={money(overview?.totals.fees ?? 0)} icon="wallet" tone="rose" />
      </div>

      {/* Koppelingen */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">{t("connections")}</h2>
            <p className="mt-0.5 text-sm text-slate-400">{t("connectionsSub")}</p>
          </div>
          {canConnect && !adding && <Button onClick={() => setAdding("choose")}><Icon name="plus" className="mr-1.5 h-4 w-4" />{t("add")}</Button>}
        </div>

        {active.length === 0 && !adding && (
          <p className="mt-6 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">{t("empty")}</p>
        )}

        <ul className="mt-5 space-y-2.5">
          {active.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200"><Icon name={c.platform === "CSV" ? "download" : "store"} className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{c.name} <span className="ml-1 text-xs font-normal text-slate-500">{PLATFORM_LABEL[c.platform]}</span></p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                    <span className={cn("inline-flex items-center gap-1.5", c.status === "ACTIVE" ? "text-emerald-300" : c.status === "ERROR" ? "text-rose-300" : "text-slate-500")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", c.status === "ACTIVE" ? "bg-emerald-400" : c.status === "ERROR" ? "bg-rose-400" : "bg-slate-500")} />
                      {t(`status.${c.status}`)}
                    </span>
                    <span>· {t("orderCount", { count: c.orderCount })}</span>
                    {c.lastSyncAt && <span>· {t("lastSync", { date: new Date(c.lastSyncAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) })}</span>}
                  </p>
                  {c.status === "ERROR" && c.lastError && <p className="mt-1 text-xs text-rose-300">{c.lastError}</p>}
                </div>
              </div>
              {c.platform !== "CSV" && c.status !== "DISCONNECTED" && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" disabled={!!busy || !canConnect} onClick={() => sync(c)}>
                    <Icon name="refresh" className={cn("mr-1.5 h-4 w-4", busy === c.id && "animate-spin")} />{t("sync")}
                  </Button>
                  <Button variant="ghost" disabled={!!busy} onClick={() => disconnect(c)}>{t("disconnect")}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {adding && canConnect && (
          <ConnectPanel
            step={adding}
            onChoose={setAdding}
            onCancel={() => setAdding(null)}
            onDone={async (msg) => { setAdding(null); setError(null); setInfo(msg); await load().catch(() => undefined); }}
          />
        )}
      </Card>

      {/* OSS */}
      {overview && <OssCard oss={overview.oss} money={money} />}

      {/* Dagtotalen + bronnen */}
      {overview && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold text-white">{t("days")}</h2>
            <p className="mt-0.5 text-sm text-slate-400">{t("daysSub")}</p>
            {overview.days.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">{t("noOrders")}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[440px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="pb-2 font-medium">{t("col.date")}</th>
                      <th className="pb-2 font-medium">{t("col.orders")}</th>
                      <th className="pb-2 text-right font-medium">{t("col.gross")}</th>
                      <th className="pb-2 text-right font-medium">{t("col.vat")}</th>
                      <th className="pb-2 text-right font-medium">{t("col.fees")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.days.map((d) => (
                      <tr key={d.date} className="border-t border-white/[0.05]">
                        <td className="py-2 text-slate-300">{new Date(`${d.date}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}</td>
                        <td className="py-2 text-slate-400">{d.orders}{d.refunds > 0 && <span className="text-rose-300"> (−{d.refunds})</span>}</td>
                        <td className="py-2 text-right font-semibold tabular-nums text-white">{money(d.gross)}</td>
                        <td className="py-2 text-right tabular-nums text-slate-300">{money(d.vat)}</td>
                        <td className="py-2 text-right tabular-nums text-slate-400">{money(d.fees)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold text-white">{t("sources")}</h2>
            <ul className="mt-4 space-y-3">
              {overview.sources.length === 0 && <li className="text-sm text-slate-500">{t("noOrders")}</li>}
              {overview.sources.map((s) => {
                const max = Math.max(...overview.sources.map((x) => x.gross), 1);
                return (
                  <li key={s.source}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{s.source}</span>
                      <span className="font-semibold tabular-nums text-white">{money(s.gross)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400" style={{ width: `${Math.max(2, (s.gross / max) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {overview.otherCurrency > 0 && <p className="mt-4 text-xs text-amber-300">{t("otherCurrency", { count: overview.otherCurrency })}</p>}
          </Card>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">{t("disclaimer")}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OSS-kaart: drempelmeter + tabel per land
// ---------------------------------------------------------------------------
function OssCard({ oss, money }: { oss: OssSummary; money: (n: number) => string }) {
  const t = useTranslations("webshop.oss");
  const pct = Math.min(oss.thresholdPct, 100);
  const mismatches = oss.perCountry.filter((r) => r.rateMismatch);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">{t("title")}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-400">{t("subtitle")}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", oss.thresholdExceeded ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/10 text-emerald-300")}>
          {oss.thresholdExceeded ? t("over") : t("under")}
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-300">{t("meter", { year: oss.year })}</span>
          <span className="font-semibold tabular-nums text-white">{money(oss.crossBorderNet)} <span className="font-normal text-slate-500">/ {money(oss.threshold)}</span></span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className={cn("h-full rounded-full bg-gradient-to-r", oss.thresholdExceeded ? "from-amber-500 to-orange-400" : "from-brand-500 to-fuchsia-400")} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">{oss.thresholdExceeded ? t("overHelp") : t("underHelp")}</p>
      </div>

      {mismatches.length > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-200">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          {t("mismatch", { countries: mismatches.map((m) => m.country).join(", ") })}
        </p>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="pb-2 font-medium">{t("country")}</th>
              <th className="pb-2 font-medium">{t("orders")}</th>
              <th className="pb-2 text-right font-medium">{t("net")}</th>
              <th className="pb-2 text-right font-medium">{t("vat")}</th>
              <th className="pb-2 text-right font-medium">{t("rate")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-white/[0.05]">
              <td className="py-2 font-semibold text-white">NL <span className="font-normal text-slate-500">{t("domestic")}</span></td>
              <td className="py-2 text-slate-400">{oss.domestic.orders}</td>
              <td className="py-2 text-right tabular-nums text-white">{money(oss.domestic.net)}</td>
              <td className="py-2 text-right tabular-nums text-slate-300">{money(oss.domestic.vat)}</td>
              <td className="py-2 text-right text-slate-400">21%</td>
            </tr>
            {oss.perCountry.map((r) => (
              <tr key={r.country} className="border-t border-white/[0.05]">
                <td className="py-2 font-semibold text-white">{r.country}</td>
                <td className="py-2 text-slate-400">{r.orders}</td>
                <td className="py-2 text-right tabular-nums text-white">{money(r.net)}</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{money(r.vat)}</td>
                <td className={cn("py-2 text-right", r.rateMismatch ? "font-semibold text-amber-300" : "text-slate-400")}>
                  {r.effectiveRate !== null ? `${r.effectiveRate}%` : "—"}
                  {r.standardRate !== null && <span className="text-slate-500"> ({t("standard", { rate: r.standardRate })})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {oss.perCountry.length === 0 && <p className="mt-3 text-sm text-slate-500">{t("noForeign")}</p>}
      {oss.unknownCountry > 0 && <p className="mt-3 text-xs text-slate-500">{t("unknown", { count: oss.unknownCountry })}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Koppelpaneel: platform kiezen → sleutels invullen of CSV uploaden
// ---------------------------------------------------------------------------
function ConnectPanel({
  step,
  onChoose,
  onCancel,
  onDone,
}: {
  step: Platform | "choose";
  onChoose: (p: Platform | "choose") => void;
  onCancel: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const t = useTranslations("webshop.connect");
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState<CsvOrderResult | null>(null);
  const [source, setSource] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/webshop/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: step, ...form }),
      });
      if (!res.ok) throw new Error(await readError(res, t("error")));
      const data = await res.json();
      await onDone(data.hasMore ? t("connectedMore", { count: data.imported }) : t("connected", { count: data.imported }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  function readFile(file: File) {
    setError(null);
    if (file.size > 10_000_000) { setError(t("csvTooBig")); return; }
    if (!source) setSource(file.name.replace(/\.[^.]+$/, "").slice(0, 60));
    const reader = new FileReader();
    reader.onerror = () => setError(t("csvError"));
    reader.onload = () => {
      const key = `csv-${(source || file.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
      const result = parseOrderCsv(String(reader.result ?? ""), key);
      if (result.error) { setCsv(null); setError(t(`csvErr.${result.error}`)); return; }
      if (result.orders.length === 0) { setCsv(null); setError(t("csvNone")); return; }
      setCsv(result);
    };
    reader.readAsText(file);
  }

  async function importCsv() {
    if (!csv) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/webshop/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: source.trim() || "CSV", orders: csv.orders }),
      });
      if (!res.ok) throw new Error(await readError(res, t("error")));
      const data = await res.json();
      await onDone(t("imported", { count: data.imported, duplicates: data.duplicates }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  const tiles: { p: Platform; icon: "store" | "download"; note: string }[] = [
    { p: "SHOPIFY", icon: "store", note: t("api") },
    { p: "WOOCOMMERCE", icon: "store", note: t("api") },
    { p: "BOLCOM", icon: "store", note: t("api") },
    { p: "CSV", icon: "download", note: t("csvNote") },
  ];

  return (
    <div className="mt-6 rounded-2xl border border-brand-400/25 bg-brand-500/[0.04] p-5">
      {step === "choose" ? (
        <>
          <p className="font-semibold text-white">{t("choose")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <button
                key={tile.p}
                onClick={() => onChoose(tile.p)}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition-colors hover:border-brand-400/50 hover:bg-brand-500/10"
              >
                <Icon name={tile.icon} className="h-5 w-5 text-brand-300" />
                <span>
                  <span className="block text-sm font-semibold text-white">{tile.p === "CSV" ? t("csvTitle") : PLATFORM_LABEL[tile.p]}</span>
                  <span className="text-xs text-slate-400">{tile.note}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4"><Button variant="ghost" onClick={onCancel}>{t("cancel")}</Button></div>
        </>
      ) : step === "CSV" ? (
        <div className="space-y-4">
          <p className="font-semibold text-white">{t("csvTitle")}</p>
          <p className="text-sm text-slate-400">{t("csvHelp")}</p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">{t("sourceLabel")}</span>
            <input className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Etsy" maxLength={60} />
          </label>
          <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Icon name="download" className="mr-1.5 h-4 w-4" />{t("chooseFile")}</Button>
          {csv && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
              <p className="font-semibold text-white">{t("preview", { count: csv.orders.length })}</p>
              <p className="mt-1 text-slate-400">{t("recognized", { columns: csv.recognized.join(", ") })}</p>
              {csv.skipped > 0 && <p className="mt-1 text-amber-300">{t("skipped", { count: csv.skipped })}</p>}
              <ul className="mt-3 space-y-1 text-xs text-slate-300">
                {csv.orders.slice(0, 5).map((o) => (
                  <li key={o.externalId} className="flex justify-between gap-3">
                    <span className="truncate">{o.orderDate} · {o.orderNumber ?? "—"} · {o.country ?? "?"} {o.kind === "REFUND" && "· retour"}</span>
                    <span className="tabular-nums">{o.kind === "REFUND" ? "−" : ""}€ {o.totalGross.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={!csv || busy} onClick={importCsv}>{busy ? t("busy") : t("importCta")}</Button>
            <Button variant="ghost" onClick={() => onChoose("choose")}>{t("back")}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="space-y-4">
          <p className="font-semibold text-white">{t("connectTitle", { platform: PLATFORM_LABEL[step] })}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-400">
            {[0, 1, 2].map((i) => <li key={i}>{t(`help.${step}.${i}`)}</li>)}
          </ol>
          {(step === "SHOPIFY" || step === "WOOCOMMERCE") && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">{t(step === "SHOPIFY" ? "shopifyUrl" : "wooUrl")}</span>
              <input className={inputCls} required onChange={set("shopUrl")} placeholder={step === "SHOPIFY" ? "mijnwinkel.myshopify.com" : "https://mijnwinkel.nl"} autoComplete="off" />
            </label>
          )}
          {step === "SHOPIFY" && <SecretField label={t("shopifyToken")} placeholder="shpat_…" onChange={set("accessToken")} />}
          {step === "WOOCOMMERCE" && (
            <>
              <SecretField label={t("wooKey")} placeholder="ck_…" onChange={set("consumerKey")} />
              <SecretField label={t("wooSecret")} placeholder="cs_…" onChange={set("consumerSecret")} />
            </>
          )}
          {step === "BOLCOM" && (
            <>
              <SecretField label={t("bolId")} onChange={set("clientId")} />
              <SecretField label={t("bolSecret")} onChange={set("clientSecret")} />
            </>
          )}
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><Icon name="shield" className="h-3.5 w-3.5" />{t("safe")}</p>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? t("testing") : t("connectCta")}</Button>
            <Button type="button" variant="ghost" onClick={() => onChoose("choose")}>{t("back")}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function SecretField({ label, placeholder, onChange }: { label: string; placeholder?: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <input type="password" className={inputCls} required minLength={8} onChange={onChange} placeholder={placeholder} autoComplete="new-password" spellCheck={false} />
    </label>
  );
}
