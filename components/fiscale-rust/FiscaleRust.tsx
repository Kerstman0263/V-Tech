"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, formatMoney } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";

// ---------------------------------------------------------------------------
// Hulpfuncties — lokaal in de browser, geen data verlaat het apparaat.
// ---------------------------------------------------------------------------

// Zet een bedrag-string (NL of intl notatie, met +/- en €) om naar een getal.
function parseAmount(raw: string): number {
  let s = raw.replace(/["'\s€]/g, "");
  if (!s) return NaN;
  const negative = /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[+\-]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let n: string;
  if (lastComma > -1 && lastDot > -1) {
    n = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    n = s.replace(",", ".");
  } else if (lastDot > -1 && s.length - lastDot - 1 === 3 && s.replace(".", "").length > 3) {
    n = s.replace(/\./g, "");
  } else {
    n = s;
  }
  const v = parseFloat(n);
  if (isNaN(v)) return NaN;
  return negative ? -Math.abs(v) : v;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Best-effort parser voor bank-CSV's (ING / Rabobank / Knab): telt alle
// bijgeschreven (credit) bedragen op. Geeft null als er niets gevonden is.
function parseBankCsv(text: string): { count: number; total: number } | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  const semi = (lines[0].match(/;/g) || []).length;
  const comma = (lines[0].match(/,/g) || []).length;
  const delim = semi > comma ? ";" : ",";
  const header = splitCsvLine(lines[0], delim).map((h) => h.toLowerCase().replace(/"/g, "").trim());
  // Kies de hoofdbedrag-kolom: eerst exacte match, dan een "bedrag"-kolom die
  // geen rente/valuta/saldo is (voorkomt dat de verkeerde kolom wordt gesommeerd).
  let amountIdx = header.findIndex((h) => h === "bedrag" || h === "amount" || h === "bedrag (eur)" || h === "transactiebedrag");
  if (amountIdx === -1) amountIdx = header.findIndex((h) => h.includes("bedrag") && !/(rente|valuta|saldo|vreemde)/.test(h));
  if (amountIdx === -1) amountIdx = header.findIndex((h) => h.includes("amount"));
  if (amountIdx === -1) return null;
  const dirIdx = header.findIndex((h) => /af.?bij|bij.?af|debet|credit|debit/.test(h));
  let count = 0;
  let total = 0;
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r], delim);
    const amt = parseAmount(cols[amountIdx] ?? "");
    if (isNaN(amt)) continue;
    let isCredit: boolean;
    if (dirIdx > -1) {
      const dir = (cols[dirIdx] ?? "").toLowerCase().replace(/"/g, "").trim();
      isCredit = dir.includes("bij") || dir.includes("credit") || dir === "c" || dir === "cr";
    } else {
      isCredit = amt > 0;
    }
    if (isCredit && amt !== 0) {
      count++;
      total += Math.abs(amt);
    }
  }
  if (count === 0 || total <= 0) return null;
  return { count, total };
}

// ---------------------------------------------------------------------------
// Tarieven (indicatief) — één plek zodat ze makkelijk bij te werken zijn.
// ---------------------------------------------------------------------------
const ZVW_RATE = 0.0532; // bijdrage Zorgverzekeringswet (indicatie)
const ZVW_MAX_GRONDSLAG = 75864; // max bijdrage-inkomen Zvw (indicatief, orde 2025)
const IB_DEFAULT = 30; // realistische reservering over de winst (%)

type ReserveKey = "btw" | "ib" | "zvw" | "vpb";
const TONE: Record<ReserveKey, { bar: string; dot: string; icon: IconName; text: string }> = {
  btw: { bar: "from-amber-500 to-orange-500", dot: "bg-amber-400", icon: "receipt", text: "text-amber-300" },
  ib: { bar: "from-rose-500 to-pink-500", dot: "bg-rose-400", icon: "building", text: "text-rose-300" },
  zvw: { bar: "from-sky-500 to-cyan-500", dot: "bg-sky-400", icon: "heart", text: "text-sky-300" },
  vpb: { bar: "from-rose-500 to-pink-500", dot: "bg-rose-400", icon: "building", text: "text-rose-300" },
};

// Vennootschapsbelasting (bv): 19% tot € 200.000 winst, 25,8% daarboven (2025, indicatief).
const VPB_LOW_RATE = 0.19;
const VPB_HIGH_RATE = 0.258;
const VPB_THRESHOLD = 200_000;
function vpbTax(profit: number): number {
  return Math.min(profit, VPB_THRESHOLD) * VPB_LOW_RATE + Math.max(0, profit - VPB_THRESHOLD) * VPB_HIGH_RATE;
}

// Donker invoerveld (matcht de rest van de app).
const FIELD =
  "w-full rounded-xl border border-white/[0.08] bg-[#12112a]/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all duration-200 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/50";

/**
 * mode "ib"  = zzp / eenmanszaak / vof: btw + inkomstenbelasting + Zvw
 * mode "vpb" = bv: btw + vennootschapsbelasting (geen Zvw), DGA-loon als aandachtspunt
 */
export function FiscaleRust({ locale = "nl", kor = false, mode = "ib" }: { locale?: string; kor?: boolean; mode?: "ib" | "vpb" }) {
  const t = useTranslations("fiscaleRust");
  const fileRef = useRef<HTMLInputElement>(null);

  const [gross, setGross] = useState<number | null>(null);
  const [manual, setManual] = useState("");
  const [costs, setCosts] = useState("");
  const [btwRate, setBtwRate] = useState<21 | 9>(21);
  const [ibPct, setIbPct] = useState(IB_DEFAULT);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const money = (n: number) => formatMoney(n, locale, "EUR");

  function handleManual() {
    setError(null);
    setInfo(null);
    const v = parseAmount(manual);
    if (isNaN(v) || v <= 0) {
      setError(t("manualError"));
      setGross(null);
      return;
    }
    setGross(v);
  }

  function handleFile(file: File) {
    setError(null);
    setInfo(null);
    const reader = new FileReader();
    reader.onerror = () => setError(t("fileError"));
    reader.onload = () => {
      const result = parseBankCsv(String(reader.result ?? ""));
      if (!result) {
        setError(t("csvError"));
        setGross(null);
        return;
      }
      setGross(result.total);
      setInfo(t("csvImported", { count: result.count, total: money(result.total) }));
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  // --- Berekening: reserveringen voor de Belastingdienst ---
  // Met KOR reken je geen btw: de ingevoerde omzet is meteen de omzet excl. btw
  // en er is geen btw-afdracht.
  const rate = kor ? 0 : btwRate / 100;
  const omzetIncl = gross ?? 0;
  const omzetEx = kor ? omzetIncl : omzetIncl / (1 + rate);
  const kostenParsed = parseAmount(costs);
  const kosten = isNaN(kostenParsed) || kostenParsed < 0 ? 0 : kostenParsed;
  // Btw-afdracht = output-btw op de omzet minus voorbelasting op de (excl. btw
  // ingevoerde) kosten. Nooit negatief. Bij KOR: 0.
  const btw = kor ? 0 : Math.max(0, omzetIncl - omzetEx - kosten * rate);
  const winst = Math.max(0, omzetEx - kosten);
  const isVpb = mode === "vpb";
  // Zvw over de winst, begrensd tot het maximum bijdrage-inkomen (indicatief). Niet bij een bv.
  const zvw = isVpb ? 0 : Math.min(winst, ZVW_MAX_GRONDSLAG) * ZVW_RATE;
  // Winstbelasting: ib (schuifbaar %) voor eenmanszaak/vof/zzp, vpb (schijven) voor de bv.
  const ib = isVpb ? vpbTax(winst) : winst * (ibPct / 100);
  const buffer = btw + ib + zvw; // moet gereserveerd blijven
  const vrij = Math.max(0, winst - ib - zvw); // vrij bedrijfskapitaal

  const vpbPctLabel = winst > VPB_THRESHOLD ? "19% / 25,8%" : "19%";
  const allReserves: { key: ReserveKey; value: number; pctLabel: string }[] = [
    { key: "btw", value: btw, pctLabel: `${btwRate}%` },
    isVpb ? { key: "vpb", value: ib, pctLabel: vpbPctLabel } : { key: "ib", value: ib, pctLabel: `${ibPct}%` },
    { key: "zvw", value: zvw, pctLabel: `${(ZVW_RATE * 100).toFixed(2).replace(".", ",")}%` },
  ];
  // Bij KOR is er geen btw-post; bij een bv geen Zvw-post.
  const reserves = allReserves.filter((r) => !(kor && r.key === "btw") && !(isVpb && r.key === "zvw"));

  const hasResult = gross !== null && gross > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Input & instellingen */}
      <div data-tour="fiscale-rust-input" className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
        <h2 className="font-semibold text-white">{t("importTitle")}</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {/* Drag & drop */}
          <div
            data-tour="fiscale-rust-import"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
              dragging ? "border-brand-500 bg-brand-500/10" : "border-white/10 bg-white/[0.02] hover:border-brand-400/40 hover:bg-white/[0.04]",
            )}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300" aria-hidden><Icon name="download" className="h-6 w-6" /></div>
            <p className="mt-2 font-semibold text-slate-200">{t("dropTitle")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("dropHint")}</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>

          {/* Handmatig + instellingen */}
          <div className="flex flex-col justify-center gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300">{kor ? t("manualLabelKor") : t("manualLabel")}</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleManual(); }}
                  placeholder={t("manualPlaceholder")}
                  className={FIELD}
                />
                <button onClick={handleManual} className="shrink-0 rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md">
                  {t("calc")}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">{t("manualHint")}</p>
            </div>

            {/* Btw-tarief — niet van toepassing bij KOR */}
            {kor ? (
              <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.08] px-3 py-2 text-xs text-brand-200">
                {t("korActive")}
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium text-slate-300">{t("btwRateLabel")}</label>
                <div className="mt-1 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                  {([21, 9] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setBtwRate(r)}
                      className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition-all", btwRate === r ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white")}
                    >
                      {r}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Kosten */}
            <div>
              <label className="text-sm font-medium text-slate-300">{t("costsLabel")}</label>
              <input type="text" inputMode="decimal" value={costs} onChange={(e) => setCosts(e.target.value)} placeholder={t("costsPlaceholder")} className={cn(FIELD, "mt-1")} />
            </div>
          </div>
        </div>

        {/* Winstbelasting: ib-slider (eenmanszaak/vof/zzp) of vaste vpb-schijven (bv) */}
        {isVpb ? (
          <div data-tour="fiscale-rust-ib-slider" className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-sm font-medium text-slate-300">{t("vpb")}</p>
              <p className="tabular mt-1 text-lg font-bold text-white">{vpbPctLabel}</p>
              <p className="mt-1 text-xs text-slate-500">{t("vpbHint")}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
              <p className="text-sm font-medium text-amber-200">{t("dgaTitle")}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{t("dgaHint")}</p>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">{t("legalFormNote")}</p>
          </div>
        ) : (
          <div data-tour="fiscale-rust-ib-slider" className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">{t("ibLabel")}</label>
              <span className="tabular rounded-lg bg-white/5 px-2.5 py-1 text-sm font-bold text-white ring-1 ring-white/10">{ibPct}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={40}
              value={ibPct}
              onChange={(e) => setIbPct(Number(e.target.value))}
              aria-label={t("ibLabel")}
              className="w-full cursor-pointer appearance-none rounded-full bg-white/10 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:shadow-glow"
            />
            <p className="mt-1 text-xs text-slate-500">{t("ibHint")}</p>
          </div>
        )}

        {info && <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{info}</p>}
        {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      </div>

      {/* 2. Resultaat */}
      <div data-tour="fiscale-rust-result">
      {!hasResult ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name="piggy-bank" className="h-5 w-5" /></div>
          <p className="mt-3 text-sm text-slate-500">{t("emptyState")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Hero: de belastingbuffer */}
          <div className="relative overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-[#241356] to-[#0d0a20] p-6 text-white shadow-xl shadow-black/30 sm:p-8">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-500/25 blur-3xl" />
            <div className="relative">
              <p className="text-sm font-medium text-brand-200">{t("bufferTitle")} · {t("grossLabel")} {money(omzetIncl)}</p>
              <p className="tabular mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{money(buffer)}</p>
              <p className="mt-2 max-w-xl text-sm text-slate-300">{t("bufferSub")}</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 ring-1 ring-emerald-500/20">
                <Icon name="check-circle" className="h-4 w-4" />
                {t("freeLine", { amount: money(vrij) })}
              </div>
            </div>
          </div>

          {/* Verdeel-balk */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
            <p className="mb-3 text-sm font-medium text-slate-400">{t("splitTitle")}</p>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-white/[0.04]">
              {reserves.filter((r) => r.value > 0).map((r) => (
                <div key={r.key} className={cn("h-full rounded-full bg-gradient-to-r", TONE[r.key].bar)} style={{ width: `${buffer > 0 ? (r.value / buffer) * 100 : 0}%` }} title={`${t(`${r.key}.label`)} · ${money(r.value)}`} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
              {reserves.map((r) => (
                <span key={r.key} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", TONE[r.key].dot)} />
                  {t(`${r.key}.label`)} · {r.pctLabel}
                </span>
              ))}
            </div>
          </div>

          {/* 3 reserveringskaarten + vrij bedrijfskapitaal */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {reserves.map((r) => (
              <div key={r.key} className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-[#12112a]/60 p-5 backdrop-blur-md">
                <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", TONE[r.key].bar)} />
                <div className="flex items-center justify-between">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-white/5", TONE[r.key].text)}><Icon name={TONE[r.key].icon} className="h-4 w-4" /></span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300">{r.pctLabel}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-slate-400">{t(`${r.key}.label`)}</p>
                <p className="tabular mt-1 text-2xl font-extrabold tracking-tight text-white">{money(r.value)}</p>
                <p className="mt-1 text-xs text-slate-500">{t(`${r.key}.sub`)}</p>
              </div>
            ))}

            {/* Vrij bedrijfskapitaal */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 backdrop-blur-md ring-1 ring-emerald-500/10">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><Icon name="wallet" className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-400">{t("free.label")}</p>
              <p className="tabular mt-1 text-2xl font-extrabold tracking-tight text-emerald-300">{money(vrij)}</p>
              <p className="mt-1 text-xs text-slate-500">{t("free.sub")}</p>
            </div>
          </div>

          <p className="text-center text-xs text-slate-500">{t("disclaimer")}</p>
        </div>
      )}
      </div>
    </div>
  );
}
