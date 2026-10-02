"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, formatMoney } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { calculateFiscalReserve, MAX_FISCAL_AMOUNT, type FiscalPeriod } from "@/lib/fiscal";
import { FISCAL_RATES, FISCAL_YEARS, type FiscalYear } from "@/lib/fiscal-rates";
import { parseFiscalAmount, parseFiscalCsv } from "@/lib/fiscal-csv";

type ReserveKey = "btw" | "ib" | "zvw" | "vpb" | "safety";
const TONE: Record<ReserveKey, { bar: string; dot: string; icon: IconName; text: string }> = {
  btw: { bar: "from-amber-500 to-orange-500", dot: "bg-amber-400", icon: "receipt", text: "text-amber-300" },
  ib: { bar: "from-rose-500 to-pink-500", dot: "bg-rose-400", icon: "building", text: "text-rose-300" },
  zvw: { bar: "from-sky-500 to-cyan-500", dot: "bg-sky-400", icon: "heart", text: "text-sky-300" },
  vpb: { bar: "from-rose-500 to-pink-500", dot: "bg-rose-400", icon: "building", text: "text-rose-300" },
  safety: { bar: "from-violet-500 to-purple-500", dot: "bg-violet-400", icon: "shield", text: "text-violet-300" },
};
const FIELD = "w-full min-w-0 rounded-xl border border-white/[0.08] bg-[#12112a]/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all duration-200 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/50";
const BUTTON = "rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-50";
const PREVIEW_PAGE_SIZE = 25;

export function FiscaleRust({ locale = "nl", kor = false, mode = "ib", currentYear = new Date().getFullYear() }: {
  locale?: string; kor?: boolean; mode?: "ib" | "vpb"; currentYear?: number;
}) {
  const t = useTranslations("fiscaleRust");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const fileRequest = useRef(0);
  const [year, setYear] = useState<FiscalYear>(FISCAL_YEARS[FISCAL_YEARS.length - 1]);
  const [period, setPeriod] = useState<FiscalPeriod>("year");
  const [gross, setGross] = useState<number | null>(null);
  const [grossSource, setGrossSource] = useState<"manual" | "csv" | null>(null);
  const [manual, setManual] = useState("");
  const [costs, setCosts] = useState("");
  const [inputVat, setInputVat] = useState("");
  const [vatRate, setVatRate] = useState<0 | 9 | 21>(21);
  const [customVat, setCustomVat] = useState(false);
  const [outputVat, setOutputVat] = useState("");
  const [annualProfit, setAnnualProfit] = useState("");
  const [ibPercent, setIbPercent] = useState(30);
  const [safetyPercent, setSafetyPercent] = useState(10);
  const [preview, setPreview] = useState<ReturnType<typeof parseFiscalCsv> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewPage, setPreviewPage] = useState(0);
  const [fileLoading, setFileLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const money = (n: number) => formatMoney(n, locale, "EUR");
  const percent = (n: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(n);
  const rates = FISCAL_RATES[year];
  const isVpb = mode === "vpb";
  const amount = (value: string) => value.trim() === "" ? 0 : parseFiscalAmount(value);
  const costAmount = amount(costs);
  const inputVatAmount = kor ? 0 : amount(inputVat);
  const outputVatAmount = !kor && customVat ? parseFiscalAmount(outputVat) : undefined;
  const annualProfitAmount = annualProfit.trim() === "" ? undefined : parseFiscalAmount(annualProfit);
  const validAmount = (value: number) => Number.isFinite(value) && value >= 0 && value <= MAX_FISCAL_AMOUNT;
  const invalidField = !validAmount(costAmount) ? (kor ? "costsLabelKor" : "costsLabel")
    : !validAmount(inputVatAmount) ? "inputVatLabel"
    : outputVatAmount !== undefined && (!validAmount(outputVatAmount) || (gross !== null && outputVatAmount > gross)) ? "outputVatLabel"
    : annualProfitAmount !== undefined && (!Number.isFinite(annualProfitAmount) || Math.abs(annualProfitAmount) > MAX_FISCAL_AMOUNT) ? "annualProfitLabel" : null;
  const validationError = gross !== null && invalidField ? t("amountError", { field: t(invalidField), max: money(MAX_FISCAL_AMOUNT) }) : null;
  let result: ReturnType<typeof calculateFiscalReserve> | null = null;
  let calculationError: string | null = null;
  if (gross !== null && !invalidField) {
    try {
      result = calculateFiscalReserve({ year, period, mode, kor, gross, costs: costAmount, vatRate, inputVat: inputVatAmount, outputVat: outputVatAmount, ibPercent, safetyPercent, annualProfit: annualProfitAmount });
    } catch {
      calculationError = t("calculationError");
    }
  }
  const displayedError = error ?? validationError ?? calculationError;
  const outsideYear = (date: string) => date !== "" && Number(date.slice(0, 4)) !== year;
  const selectedRows = preview?.rows.filter((row) => selected.has(row.id) && !outsideYear(row.date)) ?? [];
  const selectedTotal = selectedRows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  const previewPages = Math.max(1, Math.ceil((preview?.rows.length ?? 0) / PREVIEW_PAGE_SIZE));
  const reserves: { key: ReserveKey; value: number; pctLabel: string }[] = result ? [
    ...(!kor ? [{ key: "btw" as const, value: result.vatReserve, pctLabel: customVat ? t("customVatBadge") : `${vatRate}%` }] : []),
    { key: isVpb ? "vpb" as const : "ib" as const, value: result.taxReserve, pctLabel: isVpb ? `${percent(rates.vpb.lowRate)} / ${percent(rates.vpb.highRate)}` : `${ibPercent}%` },
    ...(!isVpb ? [{ key: "zvw" as const, value: result.zvwReserve, pctLabel: percent(rates.zvw.rate) }] : []),
    { key: "safety", value: result.safetyReserve, pctLabel: `${safetyPercent}%` },
  ] : [];

  function clearAppliedCsv() {
    if (grossSource === "csv") {
      setGross(null);
      setGrossSource(null);
      setManual("");
    }
    setInfo(null);
  }

  function handleManual() {
    setError(null);
    setInfo(null);
    const value = parseFiscalAmount(manual);
    if (!validAmount(value)) {
      setError(t("manualError", { max: money(MAX_FISCAL_AMOUNT) }));
      setGross(null);
      return;
    }
    setGross(value);
    setGrossSource("manual");
  }

  async function handleFile(file: File) {
    const request = ++fileRequest.current;
    setError(null);
    clearAppliedCsv();
    setPreview(null);
    setSelected(new Set());
    setPreviewPage(0);
    setFileLoading(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("File too large");
      const contents = await file.text();
      if (request !== fileRequest.current) return;
      const parsed = parseFiscalCsv(contents);
      if (!parsed.rows.length) {
        setError(t("csvEmpty"));
      } else {
        setPreview(parsed);
      }
    } catch {
      if (request === fileRequest.current) setError(t("csvError"));
    } finally {
      if (request === fileRequest.current) setFileLoading(false);
    }
  }

  function applySelected() {
    if (!selectedRows.length || !validAmount(selectedTotal)) {
      setError(t("csvSelectionError", { max: money(MAX_FISCAL_AMOUNT) }));
      return;
    }
    setGross(selectedTotal);
    setGrossSource("csv");
    setManual(new Intl.NumberFormat(locale, { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(selectedTotal));
    setError(null);
    setInfo(t("csvImported", { count: selectedRows.length, total: money(selectedTotal) }));
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section data-tour="fiscale-rust-input" aria-labelledby={`${id}-input-title`} className="min-w-0 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
        <h2 id={`${id}-input-title`} className="font-semibold text-white">{t("importTitle")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("estimateHint")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-year`} className="text-sm font-medium text-slate-300">{t("yearLabel")}</label>
            <select id={`${id}-year`} value={year} onChange={(event) => { setYear(Number(event.target.value) as FiscalYear); setSelected(new Set()); clearAppliedCsv(); }} className={cn(FIELD, "mt-1 bg-[#12112a]")}>
              {FISCAL_YEARS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-period`} className="text-sm font-medium text-slate-300">{t("periodLabel")}</label>
            <select id={`${id}-period`} value={period} onChange={(event) => { setPeriod(event.target.value as FiscalPeriod); setSelected(new Set()); clearAppliedCsv(); }} aria-describedby={`${id}-period-hint`} className={cn(FIELD, "mt-1 bg-[#12112a]")}>
              {(["year", "quarter", "month"] as const).map((value) => <option key={value} value={value}>{t(`period.${value}`)}</option>)}
            </select>
          </div>
        </div>
        <p id={`${id}-period-hint`} className="mt-2 text-xs leading-relaxed text-slate-400">{t("periodHint")}</p>
        {!FISCAL_YEARS.some((value) => value === currentYear) && <p role="status" className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">{t("unsupportedYear", { currentYear, year })}</p>}

        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
          <div data-tour="fiscale-rust-import" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (file) void handleFile(file); }} className={cn("flex min-w-0 flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition-colors", dragging ? "border-brand-500 bg-brand-500/10" : "border-white/10 bg-white/[0.02]")}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300" aria-hidden="true"><Icon name="download" className="h-6 w-6" /></div>
            <p className="mt-2 font-semibold text-slate-200">{t("dropTitle")}</p>
            <p className="mt-1 text-sm text-slate-400">{t("dropHint")}</p>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={fileLoading} className={cn(BUTTON, "mt-4")}>{fileLoading ? t("fileLoading") : t("chooseFile")}</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label={t("chooseFile")} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ""; }} />
            <p className="mt-3 text-xs leading-relaxed text-slate-400">{t("localFileHint")}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <label htmlFor={`${id}-gross`} className="text-sm font-medium text-slate-300">{kor ? t("manualLabelKor") : t("manualLabel")}</label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input id={`${id}-gross`} type="text" inputMode="decimal" value={manual} onChange={(event) => { setManual(event.target.value); setGross(null); setGrossSource(null); setInfo(null); setError(null); }} onKeyDown={(event) => { if (event.key === "Enter") handleManual(); }} placeholder={t("manualPlaceholder")} aria-describedby={`${id}-manual-hint${displayedError ? ` ${id}-error` : ""}`} aria-invalid={error !== null} className={cn(FIELD, "flex-1 basis-36")} />
                <button type="button" onClick={handleManual} className={BUTTON}>{t("calc")}</button>
              </div>
              <p id={`${id}-manual-hint`} className="mt-1 text-xs leading-relaxed text-slate-400">{t("manualHint")}</p>
            </div>
            {kor ? <p className="rounded-xl border border-brand-500/20 bg-brand-500/[0.08] px-3 py-2 text-xs leading-relaxed text-brand-200">{t("korActive")}</p> : <fieldset>
              <legend className="text-sm font-medium text-slate-300">{t("btwRateLabel")}</legend>
              <div className="mt-1 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {([21, 9, 0] as const).map((rate) => <button key={rate} type="button" aria-pressed={vatRate === rate} disabled={customVat} onClick={() => setVatRate(rate)} className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 disabled:opacity-50", vatRate === rate ? "bg-brand-600 text-white shadow-glow" : "text-slate-300 hover:text-white")}>{rate}%</button>)}
              </div>
            </fieldset>}
            <div>
              <label htmlFor={`${id}-costs`} className="text-sm font-medium text-slate-300">{kor ? t("costsLabelKor") : t("costsLabel")}</label>
              <input id={`${id}-costs`} type="text" inputMode="decimal" value={costs} onChange={(event) => setCosts(event.target.value)} placeholder={t("costsPlaceholder")} aria-describedby={`${id}-costs-hint`} aria-invalid={invalidField === "costsLabel" || invalidField === "costsLabelKor"} className={cn(FIELD, "mt-1")} />
              <p id={`${id}-costs-hint`} className="mt-1 text-xs leading-relaxed text-slate-400">{kor ? t("costsHintKor") : t("costsHint")}</p>
            </div>
            {!kor && <div>
              <label htmlFor={`${id}-input-vat`} className="text-sm font-medium text-slate-300">{t("inputVatLabel")}</label>
              <input id={`${id}-input-vat`} type="text" inputMode="decimal" value={inputVat} onChange={(event) => setInputVat(event.target.value)} placeholder="0" aria-describedby={`${id}-input-vat-hint`} aria-invalid={invalidField === "inputVatLabel"} className={cn(FIELD, "mt-1")} />
              <p id={`${id}-input-vat-hint`} className="mt-1 text-xs leading-relaxed text-slate-400">{t("inputVatHint")}</p>
            </div>}
          </div>
        </div>
        <p className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3 text-xs leading-relaxed text-slate-300">{t("vatTimingHint")} <a className="text-brand-300 underline underline-offset-2" href={rates.sources.vatTiming} target="_blank" rel="noreferrer">{t("vatTimingSource")}</a></p>

        {preview && <section aria-labelledby={`${id}-preview-title`} className="mt-5 min-w-0 rounded-xl border border-white/10 p-3 sm:p-4">
          <h3 id={`${id}-preview-title`} className="font-semibold text-white">{t("csvPreviewTitle", { count: preview.rows.length })}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{t("csvSelectionHint")}</p>
          {preview.skipped > 0 && <p className="mt-2 text-xs text-amber-200">{t("csvSkipped", { count: preview.skipped })}</p>}
          {preview.rows.some((row) => !row.date) && <p className="mt-2 text-xs text-amber-200">{t("csvMissingDates")}</p>}
          {preview.rows.some((row) => outsideYear(row.date)) && <p className="mt-2 text-xs text-amber-200">{t("csvOutsideYear", { count: preview.rows.filter((row) => outsideYear(row.date)).length, year })}</p>}
          <div className="mt-3 flex flex-col gap-2">
            {preview.rows.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE).map((row) => <label key={row.id} className={cn("flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3", outsideYear(row.date) && "cursor-not-allowed opacity-50")}>
              <input type="checkbox" checked={selected.has(row.id)} disabled={outsideYear(row.date)} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(row.id); else next.delete(row.id); setSelected(next); clearAppliedCsv(); }} className="mt-1 h-4 w-4 shrink-0 accent-brand-500" />
              <span className="min-w-0 flex-1 text-sm"><span className="block break-words text-slate-200">{row.description || t("csvNoDescription")}</span><span className="mt-1 block text-xs text-slate-400">{row.date || t("csvDateUnknown")}</span><span className="tabular mt-1 block font-semibold text-white">{money(row.amount)}</span></span>
            </label>)}
          </div>
          {previewPages > 1 && <nav aria-label={t("csvPagination")} className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <button type="button" disabled={previewPage === 0} onClick={() => setPreviewPage((page) => page - 1)} className="rounded-lg border border-white/10 px-3 py-2 disabled:opacity-40">{t("previous")}</button>
            <span>{t("pageCount", { page: previewPage + 1, total: previewPages })}</span>
            <button type="button" disabled={previewPage + 1 >= previewPages} onClick={() => setPreviewPage((page) => page + 1)} className="rounded-lg border border-white/10 px-3 py-2 disabled:opacity-40">{t("next")}</button>
          </nav>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-slate-300">{t("csvSelected", { count: selectedRows.length, total: money(selectedTotal) })}</p>
            <button type="button" disabled={!selectedRows.length} onClick={applySelected} className={BUTTON}>{t("csvApply")}</button>
          </div>
        </section>}

        {isVpb ? <div data-tour="fiscale-rust-ib-slider" className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"><p className="text-sm font-medium text-slate-300">{t("vpb.label")}</p><p className="tabular mt-1 text-lg font-bold text-white">{percent(rates.vpb.lowRate)} / {percent(rates.vpb.highRate)}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{t("vpbHint", { year, threshold: money(rates.vpb.threshold), low: percent(rates.vpb.lowRate), high: percent(rates.vpb.highRate) })}</p></div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4"><p className="text-sm font-medium text-amber-200">{t("dgaTitle")}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{t("dgaHint")}</p></div>
          <p className="text-xs text-slate-400 sm:col-span-2">{t("legalFormNote")}</p>
        </div> : <div data-tour="fiscale-rust-ib-slider" className="mt-5">
          <div className="mb-2 flex items-start justify-between gap-3"><label htmlFor={`${id}-ib`} className="text-sm font-medium text-slate-300">{t("ibLabel")}</label><output htmlFor={`${id}-ib`} className="tabular shrink-0 rounded-lg bg-white/5 px-2.5 py-1 text-sm font-bold text-white">{ibPercent}%</output></div>
          <input id={`${id}-ib`} type="range" min={0} max={60} value={ibPercent} onChange={(event) => setIbPercent(Number(event.target.value))} aria-describedby={`${id}-ib-hint`} className="w-full cursor-pointer accent-brand-500" />
          <p id={`${id}-ib-hint`} className="mt-1 text-xs leading-relaxed text-slate-400">{t("ibHint")}</p>
        </div>}
        <div className="mt-5">
          <div className="mb-2 flex items-start justify-between gap-3"><label htmlFor={`${id}-safety`} className="text-sm font-medium text-slate-300">{t("safetyLabel")}</label><output htmlFor={`${id}-safety`} className="tabular shrink-0 rounded-lg bg-white/5 px-2.5 py-1 text-sm font-bold text-white">{safetyPercent}%</output></div>
          <input id={`${id}-safety`} type="range" min={0} max={30} value={safetyPercent} onChange={(event) => setSafetyPercent(Number(event.target.value))} aria-describedby={`${id}-safety-hint`} className="w-full cursor-pointer accent-brand-500" />
          <p id={`${id}-safety-hint`} className="mt-1 text-xs leading-relaxed text-slate-400">{t("safetyHint")}</p>
        </div>
        <details className="mt-5 rounded-xl border border-white/[0.08] p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">{t("advancedTitle")}</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {!kor && <div>
              <label className="flex items-start gap-2 text-sm text-slate-300"><input type="checkbox" checked={customVat} onChange={(event) => setCustomVat(event.target.checked)} className="mt-1 accent-brand-500" />{t("customVatLabel")}</label>
              {customVat && <div className="mt-3"><label htmlFor={`${id}-output-vat`} className="text-sm text-slate-300">{t("outputVatLabel")}</label><input id={`${id}-output-vat`} type="text" inputMode="decimal" value={outputVat} onChange={(event) => setOutputVat(event.target.value)} aria-describedby={`${id}-output-vat-hint`} aria-invalid={invalidField === "outputVatLabel"} className={cn(FIELD, "mt-1")} /></div>}
              <p id={`${id}-output-vat-hint`} className="mt-2 text-xs leading-relaxed text-slate-400">{t("outputVatHint")}</p>
            </div>}
            <div><label htmlFor={`${id}-annual-profit`} className="text-sm text-slate-300">{t("annualProfitLabel")}</label><input id={`${id}-annual-profit`} type="text" inputMode="decimal" value={annualProfit} onChange={(event) => setAnnualProfit(event.target.value)} placeholder={t("annualProfitPlaceholder")} aria-describedby={`${id}-annual-profit-hint`} aria-invalid={invalidField === "annualProfitLabel"} className={cn(FIELD, "mt-1")} /><p id={`${id}-annual-profit-hint`} className="mt-2 text-xs leading-relaxed text-slate-400">{t("annualProfitHint")}</p></div>
          </div>
        </details>
        {info && <p role="status" className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{info}</p>}
        {displayedError && <p id={`${id}-error`} role="alert" className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{displayedError}</p>}
      </section>

      <div data-tour="fiscale-rust-result" className="min-w-0">
        {!result ? <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center"><div aria-hidden="true" className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name="piggy-bank" className="h-5 w-5" /></div><p className="mt-3 text-sm text-slate-400">{t("emptyState")}</p></div> : result.korThresholdExceeded ? <p role="alert" data-testid="fiscal-kor-warning" className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm leading-relaxed text-amber-200">{t("korExceeded", { threshold: money(rates.korThreshold) })} <a href={rates.sources.kor} target="_blank" rel="noreferrer" className="underline underline-offset-2">{t("korSource")}</a></p> : <div className="flex min-w-0 flex-col gap-6">
          <div className="relative overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-[#241356] to-[#0d0a20] p-5 text-white shadow-xl shadow-black/30 sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-500/25 blur-3xl" />
            <div className="relative min-w-0"><h2 className="text-sm font-medium text-brand-200">{t("bufferTitle")} · {year} · {t(`period.${period}`)}</h2><p data-testid="fiscal-total-buffer" className="tabular mt-1 break-words text-3xl font-extrabold tracking-tight sm:text-5xl">{money(result.totalBuffer)}</p><p className="mt-2 max-w-xl text-sm text-slate-300">{t("bufferSub", { amount: money(gross ?? 0) })}</p><p className="mt-4 inline-flex max-w-full items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 ring-1 ring-emerald-500/20"><Icon name="wallet" className="mt-0.5 h-4 w-4" /><span className="min-w-0 break-words">{t("freeLine", { amount: money(result.remainingProfit) })}</span></p><p className="mt-2 text-xs leading-relaxed text-slate-400">{t("freeHint")}</p></div>
          </div>
          {result.shortfall > 0 && <p role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200">{t("shortfall", { amount: money(result.shortfall) })}</p>}
          {result.vatRefund > 0 && <p className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-4 text-sm text-sky-200">{t("vatRefund", { amount: money(result.vatRefund) })}</p>}
          {kor && result.projectedKorThresholdExceeded && <p role="status" data-testid="fiscal-kor-warning" className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200">{t("korProjected", { threshold: money(rates.korThreshold) })} <a href={rates.sources.kor} target="_blank" rel="noreferrer" className="underline underline-offset-2">{t("korSource")}</a></p>}
          <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md"><h3 className="mb-3 text-sm font-medium text-slate-300">{t("splitTitle")}</h3><div aria-hidden="true" className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-white/[0.04]">{reserves.filter((reserve) => reserve.value > 0).map((reserve) => <div key={reserve.key} className={cn("h-full rounded-full bg-gradient-to-r", TONE[reserve.key].bar)} style={{ width: `${result.totalBuffer > 0 ? (reserve.value / result.totalBuffer) * 100 : 0}%` }} />)}</div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">{reserves.map((reserve) => <span key={reserve.key} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONE[reserve.key].dot)} />{t(`${reserve.key}.label`)} · {reserve.pctLabel}</span>)}</div></div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {reserves.map((reserve) => <div key={reserve.key} className="relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.05] bg-[#12112a]/60 p-5 backdrop-blur-md"><div aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", TONE[reserve.key].bar)} /><div className="flex flex-wrap items-center justify-between gap-2"><span aria-hidden="true" className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-white/5", TONE[reserve.key].text)}><Icon name={TONE[reserve.key].icon} className="h-4 w-4" /></span><span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300">{reserve.pctLabel}</span></div><h3 className="mt-3 text-sm font-medium text-slate-300">{t(`${reserve.key}.label`)}</h3><p data-testid={`fiscal-${reserve.key}`} className="tabular mt-1 break-words text-2xl font-extrabold tracking-tight text-white">{money(reserve.value)}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{t(`${reserve.key}.sub`)}</p></div>)}
            <div className="relative min-w-0 overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5"><div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" /><span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><Icon name="wallet" className="h-4 w-4" /></span><h3 className="mt-3 text-sm font-medium text-slate-300">{t("free.label")}</h3><p data-testid="fiscal-remaining" className="tabular mt-1 break-words text-2xl font-extrabold tracking-tight text-emerald-300">{money(result.remainingProfit)}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{t("free.sub")}</p></div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5">
            <h3 className="font-semibold text-white">{t("calculationTitle")}</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              {([
                ["revenueExVat", result.revenueExVat], ["costsSummary", costAmount], ["profitSummary", result.profit], ["annualProfitSummary", result.annualProfit],
                ...(!kor ? [["outputVatSummary", result.outputVat], ["inputVatSummary", result.inputVat], ["netVatSummary", result.netVat]] : []),
                ["baseBufferSummary", result.baseBuffer],
              ] as [string, number][]).map(([key, value]) => <div key={key} className="min-w-0 rounded-lg bg-white/[0.02] p-3"><dt className="text-slate-400">{t(key)}</dt><dd className="tabular mt-1 break-words font-semibold text-white">{money(value)}</dd></div>)}
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-slate-300">{annualProfitAmount === undefined ? t("projectionHint", { count: result.periodsPerYear }) : t("projectionOverrideHint", { count: result.periodsPerYear })}</p>
            {!isVpb && <p className="mt-2 text-xs leading-relaxed text-slate-300">{t("zvwExplanation", { rate: percent(rates.zvw.rate), max: money(rates.zvw.maxIncome), year, count: result.periodsPerYear })}</p>}
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{t("calculationLimits")}</p>
          </div>
        </div>}
      </div>
      <details className="min-w-0 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 text-xs text-slate-400">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">{t("sourcesTitle", { year })}</summary>
        <p className="mt-3 break-words">{t("revision", { revision: rates.revision, verifiedOn: rates.verifiedOn })}</p>
        <ul className="mt-3 flex list-inside list-disc flex-col gap-2 text-brand-300">
          {(isVpb ? [["vpbSource", rates.sources.vpb]] : [["zvwSource", rates.sources.zvw]]).concat([["korSource", rates.sources.kor], ["inputVatSource", rates.sources.inputVat], ["vatTimingSource", rates.sources.vatTiming]]).map(([key, url]) => <li key={key}><a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{t(key)}</a></li>)}
        </ul>
        <p className="mt-3 leading-relaxed">{t("disclaimer")}</p>
      </details>
    </div>
  );
}
