"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { Button, buttonClass } from "@/components/ui/Button";
import { Woordmerk } from "@/components/ova-ei";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DesktopChrome } from "@/components/desktop/DesktopChrome";
import { formatChargeAmount, formatPlanPrice } from "@/components/billing/formatPlanPrice";
import { PLANS, priceInclVat } from "@/lib/plans";
import { cn } from "@/lib/utils";

type BizPlan = "BUSINESS" | "BUSINESS_PLUS";

/** Download van alle accountgegevens (JSON). Een API-route, geen pagina: daarom een gewone <a>. */
const EXPORT_HREF = "/api/account/export";

/**
 * Poort na een verlopen proefperiode (alleen bedrijven).
 *
 * - Eigenaar: kies Business of Business+. Online betalen komt pas bij de
 *   officiële lancering; tot die tijd zegt de knop dat eerlijk (een 503 van de
 *   checkout wordt een vertaalde melding) en kun je ons direct bereiken.
 * - Teamlid: geen betaalknop, wel de uitleg dat de eigenaar dit regelt.
 * - Altijd: contact, en (eigenaar) je gegevens downloaden.
 */
export function TrialExpiredGate({ companyName, isOwner = true }: { companyName: string; isOwner?: boolean }) {
  const t = useTranslations("trialGate");
  const tx = useTranslations("appExtra.trialGate");
  const tp = useTranslations("pricing");
  const locale = useLocale();
  const [busy, setBusy] = useState<BizPlan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function choose(plan: BizPlan) {
    setBusy(plan);
    setNotice(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.checkoutUrl === "string") {
        window.location.href = data.checkoutUrl;
        return;
      }
      // 503 = online betalen staat nog niet aan; elk ander antwoord: algemene melding.
      if (res.status === 503) setNotice(tx("paymentAtLaunch"));
      else setNotice(locale === "nl" && typeof data.error === "string" && res.status !== 500 ? data.error : tx("paymentError"));
    } catch {
      setNotice(tx("paymentError"));
    } finally {
      setBusy(null);
    }
  }

  const plans: BizPlan[] = ["BUSINESS", "BUSINESS_PLUS"];
  const secondary = cn(buttonClass("secondary"), "min-h-11");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-grond px-4 py-12 text-white sm:px-6">
      <DesktopChrome />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10rem] h-[480px] w-[820px] max-w-[140%] -translate-x-1/2 rounded-full blur-[130px]" style={{ background: "radial-gradient(ellipse at center, rgba(124,58,237,0.20), rgba(124,58,237,0.06) 45%, transparent 72%)" }} />
      </div>

      <main className="relative w-full max-w-2xl text-center">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <Logo className="h-8 w-8" />
          <Woordmerk naam="Saldova" kleur="text-saldova-licht" className="text-lg text-white" />
        </div>

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rand bg-kaart text-saldova-licht">
          <Icon name="hourglass" className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-300">
          {isOwner ? t("body", { company: companyName }) : tx("memberBody", { company: companyName })}
        </p>

        {isOwner ? (
          <>
            <p className="mx-auto mt-4 max-w-lg rounded-xl border border-rand bg-kaart px-4 py-3 text-sm leading-relaxed text-slate-300">
              {tx("launchNote")}
            </p>
            <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
              {plans.map((p) => {
                const cfg = PLANS[p];
                const name = tp(`plans.${cfg.key}.name`);
                const featured = p === "BUSINESS_PLUS";
                return (
                  <div
                    key={p}
                    className={cn("flex flex-col rounded-3xl border bg-kaart p-6", featured ? "border-saldova/60" : "border-rand")}
                  >
                    <h2 className="text-sm font-semibold text-saldova-licht">{name}</h2>
                    <p className="mt-1 text-3xl font-extrabold tabular">
                      {formatPlanPrice(cfg.price)}
                      <span className="block text-sm font-medium text-slate-400">{tx("perMonthExVat")}</span>
                    </p>
                    {/* De incasso is inclusief btw: zeg dat vooraf, zodat de betaalpagina geen verrassing is. */}
                    <p className="mt-1 text-xs text-slate-400">{tx("chargedInclVat", { amount: formatChargeAmount(priceInclVat(p)) })}</p>
                    <p className="mt-2 text-sm text-slate-300">{t("members", { count: cfg.maxMembers })}</p>
                    <p className="mt-1 text-xs text-slate-400">{tp(`plans.${cfg.key}.desc`)}</p>
                    <Button
                      onClick={() => choose(p)}
                      disabled={busy !== null}
                      variant={featured ? "primary" : "secondary"}
                      className="mt-5 min-h-11"
                    >
                      {busy === p ? tx("busy") : t("choose", { plan: name })}
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="mx-auto mt-6 max-w-lg rounded-xl border border-rand bg-kaart px-4 py-3 text-sm leading-relaxed text-slate-300">
            {tx("memberHint")}
          </p>
        )}

        {notice && (
          <p role="status" className="mx-auto mt-5 max-w-lg rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/contact" className={secondary}>
            <Icon name="mail" className="h-4 w-4" />
            {tx("contact")}
          </Link>
          {isOwner && (
            <a href={EXPORT_HREF} download className={secondary}>
              <Icon name="download" className="h-4 w-4" />
              {tx("download")}
            </a>
          )}
        </div>

        <p className="mt-6 text-xs text-slate-400">{t("dataSafe")}</p>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <LogoutButton />
        </div>
      </main>
    </div>
  );
}
