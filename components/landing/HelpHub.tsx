"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buttonClass } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { HELP_FAQ_KEYS as FAQ_KEYS, faqAnswerKey } from "@/lib/faq";
import { guaranteeMessageValues } from "@/lib/export-guarantee";
import { useIsLaunched } from "@/components/company/LaunchStatus";

type Tab = "answers" | "ask" | "status";
type Status = { app: "ok" | "down"; fiscalYears: number[] } | null;

/**
 * Hulp-hub op de marketingsite: rechtsonder een glazen knop, daarachter een
 * paneel met drie tabbladen:
 *  1. Antwoorden — direct doorzoeken van alle veelgestelde vragen;
 *  2. Vraag stellen — gaat via /api/contact naar de support-inbox, met de
 *     pagina waar je was automatisch erbij (je hoeft niets uit te leggen);
 *  3. Status — een échte meting via /api/status, geen versiering.
 * Sluit met Escape of een klik buiten het paneel.
 */
export function HelpHub() {
  const t = useTranslations("help");
  const tf = useTranslations("faq");
  // Na de lancering de vervolgtekst bij antwoorden over "vóór de lancering" (lib/faq.ts).
  const launched = useIsLaunched();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("answers");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [statusError, setStatusError] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Status pas ophalen als iemand het tabblad opent.
  useEffect(() => {
    if (!open || tab !== "status" || status) return;
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStatus)
      .catch(() => setStatusError(true));
  }, [open, tab, status]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_KEYS.filter((k) => !q || `${tf(`${k}.q`)} ${tf(faqAnswerKey(k, launched), guaranteeMessageValues())}`.toLowerCase().includes(q));
  }, [query, tf, launched]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending("busy");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, subject: `Hulp-widget · pagina ${pathname}`.slice(0, 160) }),
      });
      setSending(res.ok ? "sent" : "error");
    } catch {
      setSending("error");
    }
  }

  const tabs: { key: Tab; icon: IconName }[] = [
    { key: "answers", icon: "search" },
    { key: "ask", icon: "chat" },
    { key: "status", icon: "shield" },
  ];

  const checks: { label: string; ok: boolean | null }[] = [
    { label: t("statusApp"), ok: status ? status.app === "ok" : statusError ? false : null },
    { label: t("statusRates", { years: status?.fiscalYears.join(" & ") ?? "…" }), ok: status ? status.fiscalYears.length > 0 : statusError ? false : null },
    { label: t("statusEu"), ok: true },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="help-hub"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-rand bg-kaart py-2.5 pl-3 pr-4 text-sm font-semibold text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saldova-licht"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white"><Icon name="chat" className="h-4 w-4" /></span>
        {t("button")}
      </button>

      {open && <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />}

      <div
        id="help-hub"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className={cn(
          "fixed inset-x-3 bottom-3 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-3xl border border-rand bg-kaart shadow-2xl shadow-black/60 transition-all duration-300 sm:inset-x-auto sm:bottom-20 sm:right-5 sm:w-[400px]",
          open ? "visible translate-y-0 opacity-100" : "invisible translate-y-3 opacity-0",
        )}
      >
        <div className="border-b border-rand px-5 pb-3 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-bold text-white">{t("title")}</p>
              <p className="text-xs text-slate-400">{t("subtitle")}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht">
              <Icon name="x-circle" className="h-5 w-5" />
            </button>
          </div>
          <div role="tablist" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-grond p-1">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                role="tab"
                aria-selected={tab === tb.key}
                onClick={() => setTab(tb.key)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors",
                  tab === tb.key ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white",
                )}
              >
                <Icon name={tb.icon} className="h-3.5 w-3.5" /> {t(`tab.${tb.key}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "answers" && (
            <div>
              <label className="relative block">
                <span className="sr-only">{t("searchLabel")}</span>
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className={cn(fieldClass, "w-full pl-9")}
                />
              </label>
              <ul className="mt-3 divide-y divide-rand">
                {results.map((k) => (
                  <li key={k}>
                    <button type="button" onClick={() => setExpanded(expanded === k ? null : k)} aria-expanded={expanded === k} className="flex w-full items-start justify-between gap-3 py-3 text-left text-sm font-medium text-slate-200 hover:text-white">
                      {tf(`${k}.q`)}
                      <span className={cn("mt-0.5 shrink-0 text-slate-500 transition-transform", expanded === k && "rotate-45")}>+</span>
                    </button>
                    {expanded === k && <p className="pb-3 text-sm leading-relaxed text-slate-400">{tf(faqAnswerKey(k, launched), guaranteeMessageValues())}</p>}
                  </li>
                ))}
              </ul>
              {results.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t("noResults")}</p>}
              <button type="button" onClick={() => setTab("ask")} className={cn(buttonClass("secondary"), "mt-3 w-full")}>
                {t("notFound")} →
              </button>
            </div>
          )}

          {tab === "ask" && (
            sending === "sent" ? (
              <div className="py-8 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300"><Icon name="check" className="h-6 w-6" /></span>
                <p className="mt-4 font-semibold text-white">{t("sentTitle")}</p>
                <p className="mt-1 text-sm text-slate-400">{t("sentBody")}</p>
              </div>
            ) : (
              <form onSubmit={send} className="space-y-3">
                <p className="rounded-xl border border-rand bg-grond px-3 py-2 text-xs text-slate-300">{t("replyTime")}</p>
                {(["name", "email"] as const).map((f) => (
                  <label key={f} className="block text-xs font-medium text-slate-400">
                    {t(`field.${f}`)}
                    <input
                      required
                      type={f === "email" ? "email" : "text"}
                      autoComplete={f === "email" ? "email" : "name"}
                      value={form[f]}
                      onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                      className={cn(fieldClass, "mt-1 w-full")}
                    />
                  </label>
                ))}
                <label className="block text-xs font-medium text-slate-400">
                  {t("field.message")}
                  <textarea
                    required
                    minLength={10}
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className={cn(fieldClass, "mt-1 w-full resize-none")}
                  />
                </label>
                <p className="text-[11px] text-slate-400">{t("context", { page: pathname })}</p>
                {sending === "error" && <p className="text-xs text-rose-300">{t("sendError")}</p>}
                <button type="submit" disabled={sending === "busy"} className={cn(buttonClass("primary"), "w-full")}>
                  {sending === "busy" ? t("sending") : t("send")}
                </button>
                <p className="text-center text-xs text-slate-400">
                  {t("customer")} <Link href="/login" className="font-semibold text-brand-300 hover:underline">{t("customerCta")}</Link>
                </p>
              </form>
            )
          )}

          {tab === "status" && (
            <div className="space-y-2">
              {checks.map((c) => (
                <div key={c.label} className="flex items-center gap-3 rounded-xl border border-rand bg-grond px-3 py-3 text-sm">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      c.ok === null ? "animate-pulse bg-slate-500" : c.ok ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" : "bg-rose-400",
                    )}
                  />
                  <span className="text-slate-200">{c.label}</span>
                </div>
              ))}
              <p className="pt-2 text-[11px] text-slate-400">{t("statusNote")}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
