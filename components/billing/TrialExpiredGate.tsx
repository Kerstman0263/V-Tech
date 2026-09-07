"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DesktopChrome } from "@/components/desktop/DesktopChrome";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

type BizPlan = "BUSINESS" | "BUSINESS_PLUS";

/**
 * Poort na een verlopen proefperiode (alleen bedrijven): kies Business of
 * Business+. Betalen loopt via de web-checkout (Mollie). Zolang die nog niet
 * live is, krijgt de gebruiker een eerlijke melding i.p.v. een dode knop.
 */
export function TrialExpiredGate({ companyName }: { companyName: string }) {
  const t = useTranslations("trialGate");
  const tp = useTranslations("pricing");
  const [busy, setBusy] = useState<BizPlan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function choose(plan: BizPlan) {
    setBusy(plan);
    setNotice(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    setNotice(t("paymentSoon"));
  }

  const plans: BizPlan[] = ["BUSINESS", "BUSINESS_PLUS"];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0A0618] px-6 py-12 text-white">
      <DesktopChrome />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10rem] h-[480px] w-[820px] max-w-[140%] -translate-x-1/2 rounded-full blur-[130px]" style={{ background: "radial-gradient(ellipse at center, rgba(20,184,166,0.22), rgba(13,148,136,0.08) 45%, transparent 72%)" }} />
      </div>

      <div className="relative w-full max-w-2xl text-center">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-2xl font-bold">
            Saldo<span className="text-brand-400">va</span>
          </span>
        </div>

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
          <Icon name="hourglass" className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-300">{t("body", { company: companyName })}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {plans.map((p) => {
            const cfg = PLANS[p];
            const featured = p === "BUSINESS_PLUS";
            return (
              <div
                key={p}
                className={cn(
                  "flex flex-col rounded-3xl border p-6 text-left",
                  featured ? "border-brand-500/40 bg-brand-500/10 shadow-[0_0_40px_-12px_rgba(20,184,166,0.5)]" : "border-white/10 bg-white/[0.03]",
                )}
              >
                <p className="text-sm font-semibold text-brand-200">{tp(`plans.${cfg.key}.name`)}</p>
                <p className="mt-1 text-3xl font-extrabold">
                  € {cfg.price}
                  <span className="text-sm font-medium text-slate-400"> {t("perMonth")}</span>
                </p>
                <p className="mt-2 text-sm text-slate-400">{t("members", { count: cfg.maxMembers })}</p>
                <p className="mt-1 text-xs text-slate-500">{tp(`plans.${cfg.key}.desc`)}</p>
                <button
                  onClick={() => choose(p)}
                  disabled={busy !== null}
                  className={cn(
                    "mt-5 rounded-xl px-5 py-3 text-sm font-semibold transition-all disabled:opacity-50",
                    featured ? "bg-brand-600 text-white shadow-glow hover:bg-brand-500" : "border border-white/15 bg-white/[0.05] text-white hover:bg-white/10",
                  )}
                >
                  {busy === p ? "…" : t("choose", { plan: tp(`plans.${cfg.key}.name`) })}
                </button>
              </div>
            );
          })}
        </div>

        {notice && (
          <p role="status" className="mx-auto mt-5 max-w-lg rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </p>
        )}
        <p className="mt-6 text-xs text-slate-500">{t("dataSafe")}</p>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm text-slate-400">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
