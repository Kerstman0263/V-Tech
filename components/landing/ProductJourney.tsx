"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { cn, formatMoney } from "@/lib/utils";
import { calculateFiscalReserve } from "@/lib/fiscal";

/** An isolated, editable example. It never creates records or sends requests. */
export function ProductJourney() {
  const t = useTranslations("home.journey");
  const locale = useLocale();
  const [step, setStep] = useState(0);
  const [hours, setHours] = useState(16);
  const revenue = hours * 75;
  const vat = revenue * 0.21;
  const reserve = calculateFiscalReserve({ year: 2026, mode: "ib", kor: false, period: "year", gross: revenue + vat,
    outputVat: vat, costs: 100, inputVat: 21, vatRate: 21, ibPercent: 30, safetyPercent: 10 });
  const money = (amount: number) => formatMoney(amount, locale);
  const keys = ["work", "invoice", "reserve"] as const;
  const icons = ["clock", "invoice", "piggy-bank"] as const;

  return (
    <section className="journey-section relative overflow-hidden px-5 py-16 sm:px-6 sm:py-24" aria-labelledby="journey-title">
      <div className="relative mx-auto max-w-7xl">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand-300">{t("eyebrow")}</p>
          <h2 id="journey-title" className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">{t("title")}</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400">{t("intro")}</p>
        </div>
        <div className="journey-shell grid overflow-hidden rounded-3xl border border-rand lg:grid-cols-[.85fr_1.15fr]">
          <div className="border-b border-rand p-5 sm:p-8 lg:border-b-0 lg:border-r">
            <div role="tablist" aria-orientation="vertical" aria-label={t("steps")} className="flex flex-col gap-3">
              {keys.map((key, index) => <button key={key} id={`journey-tab-${index}`} role="tab" type="button"
                aria-selected={step === index} aria-controls={`journey-panel-${index}`} tabIndex={step === index ? 0 : -1}
                onClick={() => setStep(index)} onKeyDown={(event) => {
                  const target = event.key === "ArrowDown" || event.key === "ArrowRight" ? (index + 1) % 3
                    : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index + 2) % 3
                    : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
                  if (target !== null) { event.preventDefault(); setStep(target); document.getElementById(`journey-tab-${target}`)?.focus(); }
                }}
                className={cn("group flex min-h-20 items-start gap-4 rounded-2xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300", step === index ? "border-brand-400/40 bg-brand-500/10" : "border-transparent hover:border-white/10 hover:bg-white/[.025]")}>
                <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold", step === index ? "bg-brand-600 text-white" : "bg-white/5 text-slate-400")}>0{index + 1}</span>
                <span><span className="block text-base font-semibold text-white">{t(`${key}.title`)}</span><span className="mt-1 block text-sm leading-relaxed text-slate-400">{t(`${key}.text`)}</span></span>
              </button>)}
            </div>
            <p className="mt-6 text-xs leading-relaxed text-slate-400">{t("example")}</p>
          </div>
          <div className="relative min-w-0 p-5 sm:p-8">
            {keys.map((key, index) => index !== step && <div key={key} id={`journey-panel-${index}`} role="tabpanel" aria-labelledby={`journey-tab-${index}`} hidden />)}
            <div className="mb-8 flex items-center justify-between gap-3 text-xs text-slate-400"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-300" />{t("preview")}</span><span>0{step + 1} / 03</span></div>
            <div key={step} id={`journey-panel-${step}`} role="tabpanel" aria-labelledby={`journey-tab-${step}`} tabIndex={0} className="journey-panel min-h-[280px] rounded-2xl border border-rand bg-grond p-5 sm:p-7">
              <Icon name={icons[step]} className="mb-5 h-6 w-6 text-brand-300" />
              {step === 0 && <div>
                <label htmlFor="journey-hours" className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-300">{t("hours")}<span className="text-3xl font-semibold tabular-nums text-white">{hours} {t("hourUnit")}</span></label>
                <input id="journey-hours" type="range" min={1} max={40} value={hours} onChange={(event) => setHours(Number(event.target.value))} className="mt-6 w-full accent-brand-400" />
                <dl className="mt-6 flex items-center justify-between gap-4 border-t border-rand pt-5"><dt className="text-sm text-slate-400">{t("rate", { amount: money(75) })}</dt><dd className="text-2xl font-semibold tabular-nums text-white">{money(revenue)}</dd></dl>
              </div>}
              {step === 1 && <div>
                <div className="mb-5 flex items-start justify-between gap-3"><h3 className="text-lg font-semibold text-white">{t("invoice.title")}</h3><span className="rounded-full border border-rand px-3 py-1 text-xs text-slate-300">{t("draft")}</span></div>
                <p className="text-sm text-slate-400">{t("line", { hours, rate: money(75) })}</p>
                <dl className="mt-6 space-y-3 text-sm"><div className="flex justify-between gap-3 text-slate-300"><dt>{t("subtotal")}</dt><dd>{money(revenue)}</dd></div><div className="flex justify-between gap-3 text-slate-400"><dt>{t("vat")}</dt><dd>{money(vat)}</dd></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-rand pt-4 text-white"><dt>{t("total")}</dt><dd data-testid="journey-invoice-total" className="text-3xl font-semibold tabular-nums">{money(revenue + vat)}</dd></div></dl>
              </div>}
              {step === 2 && <div>
                <h3 className="text-sm text-slate-300">{t("reserve.title")}</h3><p data-testid="journey-reserve" className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{money(reserve.totalBuffer)}</p>
                <dl className="mt-6 space-y-3 text-sm"><div className="flex justify-between gap-3 text-slate-400"><dt>{t("vatNet")}</dt><dd>{money(reserve.vatReserve)}</dd></div><div className="flex justify-between gap-3 text-slate-400"><dt>{t("income")}</dt><dd>{money(reserve.taxReserve + reserve.zvwReserve)}</dd></div><div className="flex justify-between gap-3 text-slate-400"><dt>{t("margin")}</dt><dd>{money(reserve.safetyReserve)}</dd></div></dl>
                <p className="mt-5 text-xs leading-relaxed text-slate-400">{t("assumptions")}</p>
              </div>}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-400">{t("local")}</span><button type="button" onClick={() => setStep((step + 1) % 3)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rand bg-kaart px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">{t(step === 2 ? "again" : "next")}<Icon name="arrow-right" className="h-4 w-4" /></button></div>
          </div>
        </div>
      </div>
    </section>
  );
}

