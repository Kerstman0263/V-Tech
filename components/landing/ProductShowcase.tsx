"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

// Interactieve product-showcase: klikbare tabs met een mini-scherm per functie.
// Boeiender dan statische screenshots — speelt op Saldova's sterke punt.
type TabKey = "invoices" | "time" | "fiscale" | "bank";

export function ProductShowcase() {
  const t = useTranslations("showcase");
  const [tab, setTab] = useState<TabKey>("invoices");

  const tabs: { key: TabKey; icon: IconName; label: string; url: string }[] = [
    { key: "invoices", icon: "receipt", label: t("tabInvoices"), url: "facturen" },
    { key: "time", icon: "clock", label: t("tabTime"), url: "uren" },
    { key: "fiscale", icon: "shield", label: t("tabFiscale"), url: "fiscale-rust" },
    { key: "bank", icon: "wallet", label: t("tabBank"), url: "bank" },
  ];
  const active = tabs.find((x) => x.key === tab)!;

  const badge = (tone: string, children: React.ReactNode) => (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>{children}</span>
  );

  return (
    <div className="mx-auto max-w-4xl">
      {/* Tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200",
              tab === x.key
                ? "border-transparent bg-brand-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.4)]"
                : "border-[#a855f7]/20 bg-[#16102E] text-[#c4b5fd] hover:text-white",
            )}
          >
            <Icon name={x.icon} className="h-4 w-4" />
            {x.label}
          </button>
        ))}
      </div>

      {/* Scherm-frame */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#7C3AED]/60 bg-[#0d0a20] shadow-[0_0_50px_-10px_rgba(124,58,237,0.45)]">
        {/* Nep-browserbalk */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          </span>
          <span className="ml-2 flex-1 truncate rounded-md bg-white/[0.04] px-3 py-1 text-center text-[11px] text-slate-500">
            saldova.vercel.app/{active.url}
          </span>
        </div>

        {/* Inhoud per tab */}
        <div className="min-h-[320px] p-5 text-slate-200">
          {tab === "invoices" && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.05] bg-[#16102E] p-3">
                  <p className="text-[10px] text-[#c4b5fd]">{t("revenue")}</p>
                  <p className="tabular text-lg font-bold text-white">€ 12.400</p>
                </div>
                <div className="rounded-xl border border-white/[0.05] bg-[#16102E] p-3">
                  <p className="text-[10px] text-[#c4b5fd]">{t("open")}</p>
                  <p className="tabular text-lg font-bold text-white">€ 1.815</p>
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.05] bg-[#16102E] text-[12px]">
                <div className="flex bg-white/[0.03] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span className="w-20">{t("colNumber")}</span><span className="flex-1">{t("colCustomer")}</span><span className="w-20">{t("colStatus")}</span><span className="w-20 text-right">{t("colAmount")}</span>
                </div>
                {[
                  ["2026-0007", "Acme B.V.", "paid", "€ 1.210"],
                  ["2026-0006", "De Vries Design", "sent", "€ 605"],
                  ["2026-0005", "Bakker & Zn", "draft", "€ 980"],
                  ["2026-0004", "Studio Nova", "paid", "€ 1.500"],
                ].map(([nr, c, s, a]) => (
                  <div key={nr} className="flex items-center border-t border-white/[0.04] px-4 py-2.5">
                    <span className="w-20 font-medium text-brand-300">{nr}</span>
                    <span className="flex-1 truncate text-slate-200">{c}</span>
                    <span className="w-20">{badge(s === "paid" ? "bg-emerald-500/15 text-emerald-300" : s === "sent" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300", t(s === "paid" ? "stPaid" : s === "sent" ? "stSent" : "stDraft"))}</span>
                    <span className="tabular w-20 text-right font-medium text-white">{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "time" && (
            <div>
              <div className="rounded-xl border border-white/[0.05] bg-[#16102E] p-3">
                <p className="text-[10px] text-[#c4b5fd]">{t("openHours")}</p>
                <p className="tabular text-lg font-bold text-white">18,5 u</p>
              </div>
              <div className="mt-3 rounded-xl border border-white/[0.05] bg-[#16102E] p-4">
                <div className="flex h-24 items-end gap-2">
                  {[40, 62, 48, 75, 58, 90].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-[12px]">
                {[
                  ["Wireframes homepage", "4,0 u"],
                  ["Klantoverleg Acme", "1,5 u"],
                  ["Ontwikkeling sprint 1", "8,0 u"],
                ].map(([d, h]) => (
                  <div key={d} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-[#16102E] px-3 py-2">
                    <span className="truncate text-slate-200">{d}</span>
                    <span className="tabular font-medium text-white">{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "fiscale" && (
            <div>
              <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-[#241356] to-[#0d0a20] p-4">
                <p className="text-[11px] text-brand-200">{t("keepAside")}</p>
                <p className="tabular mt-1 text-3xl font-extrabold text-white">€ 2.462</p>
                <p className="mt-0.5 text-[10px] text-[#c4b5fd]">{t("buffer")}</p>
              </div>
              <div className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-white/[0.04]">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: "42%" }} />
                <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-500" style={{ width: "49%" }} />
                <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-500" style={{ width: "9%" }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">
                {[[t("btw"), "€ 1.050"], [t("ib"), "€ 1.200"], [t("zvw"), "€ 212"]].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-white/[0.05] bg-[#16102E] p-3">
                    <p className="text-[10px] text-[#c4b5fd]">{l}</p>
                    <p className="tabular mt-0.5 font-bold text-white">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "bank" && (
            <div className="space-y-2 text-[12px]">
              {[
                { amt: "+ € 1.210", desc: "Overschrijving — Factuur 2026-0007", tone: "text-emerald-400", chip: "matched" },
                { amt: "+ € 605", desc: "Overschrijving — De Vries Design", tone: "text-emerald-400", chip: "suggestion" },
                { amt: "− € 45,20", desc: "Albert Heijn — Boodschappen", tone: "text-rose-400", chip: "expense" },
              ].map((r) => (
                <div key={r.desc} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-[#16102E] px-4 py-3">
                  <div className="min-w-0">
                    <p className={cn("tabular text-sm font-semibold", r.tone)}>{r.amt}</p>
                    <p className="truncate text-[11px] text-slate-400">{r.desc}</p>
                  </div>
                  {r.chip === "matched" && badge("bg-emerald-500/15 text-emerald-300", <><Icon name="check" className="mr-1 inline h-3 w-3 align-[-1px]" />{t("autoMatched")} · 2026-0007</>)}
                  {r.chip === "suggestion" && (
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-[#c4b5fd]">{t("suggestion")}: <span className="font-medium text-brand-300">2026-0006</span></span>
                      <span className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white">{t("confirm")}</span>
                    </span>
                  )}
                  {r.chip === "expense" && badge("bg-slate-500/15 text-slate-300", t("expense"))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
