"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { PLANS, plansForType } from "@/lib/plans";
import type { Plan } from "@prisma/client";

interface Props {
  plan: Plan;
  status: string;
  renews: string | null;
  accountType: "ZZP" | "BEDRIJF";
  /** Einde proefperiode (alleen bedrijven), ISO-string. */
  trialEndsAt?: string | null;
}

type PaidPlan = "GROWTH" | "PRO" | "BUSINESS" | "BUSINESS_PLUS";

export function BillingPanel({ plan, status, renews, accountType, trialEndsAt = null }: Props) {
  const t = useTranslations("settings.subscription");
  // Proefperiode (bedrijven): dagen resterend; negatief = verlopen
  const trialDays = trialEndsAt ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000) : null;
  const inTrial = accountType === "BEDRIJF" && status === "TRIALING" && trialDays !== null;
  const tp = useTranslations("pricing");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();
  const [legalForm, setLegalForm] = useState<"EENMANSZAAK" | "VOF" | "BV">("EENMANSZAAK");

  async function requestAction(path: string, body?: unknown) {
    if (busy) return null;
    setBusy(true); setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(locale === "nl" && typeof data.error === "string" ? data.error : t("actionError")); return null; }
      return data;
    } catch { setError(t("actionError")); return null; } finally { setBusy(false); }
  }
  async function upgradeToBusiness() {
    if (!confirm(t("toBusiness.confirm"))) return;
    if (await requestAction("/api/account/upgrade-to-business", { legalForm })) window.location.href = "/dashboard";
  }
  async function upgrade(target: PaidPlan) {
    if (!confirm(t("paymentConfirm", { plan: tp(`plans.${PLANS[target].key}.name`), amount: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(PLANS[target].price) }))) return;
    const data = await requestAction("/api/billing/checkout", { plan: target });
    if (typeof data?.checkoutUrl === "string") window.location.href = data.checkoutUrl;
  }
  async function cancel() {
    if (!confirm(t("cancelConfirm"))) return;
    if (await requestAction("/api/billing/cancel")) router.refresh();
  }

  // Betaalde plannen voor dit accounttype (gratis uitgezonderd). Tijdens de
  // proefperiode is het huidige plan (Business) óók een keuze: dat is precies
  // wat de klant moet bevestigen om door te gaan.
  const options = plansForType(accountType).filter((p) => p !== "FREE" && (inTrial || p !== plan)) as PaidPlan[];

  // Kleur van de status-badge.
  const statusTone = status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-300" : status === "CANCELED" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300";

  return (
    <div data-tour="settings-billing" className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name="wallet" className="h-4 w-4" /></span>
        <h2 className="font-semibold text-white">{t("title")}</h2>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {inTrial && (
        <div className={cn("mb-4 rounded-xl border px-4 py-3 text-sm", trialDays! > 0 ? "border-brand-500/30 bg-brand-500/10 text-brand-100" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>
          <span className="mr-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{t("trial.badge")}</span>
          {trialDays! > 0 ? t("trial.daysLeft", { days: trialDays }) : t("trial.expired")}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-y-3 text-sm">
        <dt className="text-slate-400">{t("currentPlan")}</dt>
        <dd className="text-right font-semibold text-white">{tp(`plans.${PLANS[plan].key}.name`)}</dd>
        <dt className="text-slate-400">{t("status")}</dt>
        <dd className="text-right"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusTone)}>{status}</span></dd>
        {renews && (
          <>
            <dt className="text-slate-400">{t("renews")}</dt>
            <dd className="text-right tabular font-medium text-slate-200">{renews.slice(0, 10)}</dd>
          </>
        )}
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {options.map((p, i) => (
          <Button
            key={p}
            variant={i === 0 ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => upgrade(p)}
          >
            {inTrial ? t("trial.choose") : t("upgrade")} → {tp(`plans.${PLANS[p].key}.name`)} (€{PLANS[p].price})
          </Button>
        ))}
        {status === "ACTIVE" && (
          <Button variant="ghost" disabled={busy} onClick={cancel}>
            {t("cancel")}
          </Button>
        )}
      </div>
      {status === "CANCELED" && <p className="mt-3 text-xs text-amber-400">{t("canceled")}</p>}

      {accountType === "ZZP" && (
        <div className="mt-6 rounded-xl border border-blue-500/25 bg-blue-500/[0.06] p-4">
          <p className="font-semibold text-white">{t("toBusiness.title")}</p>
          <p className="mt-1 text-sm text-slate-400">{t("toBusiness.text")}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
              {t("toBusiness.legalForm")}
              <select value={legalForm} onChange={(e) => setLegalForm(e.target.value as "EENMANSZAAK" | "VOF" | "BV")} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-500">
                <option value="EENMANSZAAK" className="bg-[#12112a]">{t("toBusiness.lfEenmanszaak")}</option>
                <option value="VOF" className="bg-[#12112a]">{t("toBusiness.lfVof")}</option>
                <option value="BV" className="bg-[#12112a]">{t("toBusiness.lfBv")}</option>
              </select>
            </label>
            <Button disabled={busy} onClick={upgradeToBusiness}>{t("toBusiness.cta")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
