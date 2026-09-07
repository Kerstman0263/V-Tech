"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/ui/Icon";

// Gedeeld formulier voor login én registratie (incl. AVG-consent).
// Login kent twee stappen: e-mail + wachtwoord, en — als de gebruiker
// tweestapsverificatie aan heeft — een code uit de authenticator-app
// (of een eenmalige back-upcode).
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"ZZP" | "BEDRIJF">("ZZP");
  // Rechtsvorm (alleen bedrijven): bepaalt de belastingberekening (bv = vpb)
  const [legalForm, setLegalForm] = useState<"EENMANSZAAK" | "VOF" | "BV">("EENMANSZAAK");
  const [consent, setConsent] = useState({ terms: false, privacy: false, dpa: false });
  // Tweede stap (2FA)
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [totp, setTotp] = useState("");
  const totpRef = useRef<HTMLInputElement>(null);

  // Gekozen plan uit de pricing-tabel (?plan=pro / business_plus / ...).
  // We onthouden het zodat we na registratie meteen naar de juiste
  // vervolgstap kunnen sturen (upgrade afronden bij een betaald plan).
  const [chosenPlan, setChosenPlan] = useState<string | null>(null);

  // Vanaf de pricing-links (/register?type=bedrijf&plan=business_plus) staat
  // het juiste accounttype voorgeselecteerd en onthouden we het plan.
  useEffect(() => {
    if (mode !== "register") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "bedrijf") setAccountType("BEDRIJF");
    const plan = params.get("plan");
    if (plan) setChosenPlan(plan.toLowerCase());
  }, [mode]);
  useEffect(() => {
    if (step === "totp") totpRef.current?.focus();
  }, [step]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const allConsented = consent.terms && consent.privacy && consent.dpa;

  function finish() {
    // Koos de gebruiker een betaald plan in de pricing-tabel? Stuur dan
    // direct naar de instellingen om de upgrade af te ronden; anders het
    // dashboard in.
    const paidPlan = mode === "register" && chosenPlan && chosenPlan !== "free";
    router.push(paidPlan ? "/settings?upgrade=" + chosenPlan : "/dashboard");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
    if (mode === "register") {
      if (!allConsented) {
        setLoading(false);
        setError(t("consent.required"));
        return;
      }
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          accountType,
          legalForm: accountType === "BEDRIJF" ? legalForm : undefined,
          acceptTerms: consent.terms,
          acceptPrivacy: consent.privacy,
          acceptDpa: consent.dpa,
        }),
      });
      if (!res.ok) {
        setLoading(false);
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t("invalidCredentials"));
        return;
      }
    } else if (step === "credentials") {
      // Voor-controle: kloppen de gegevens en is 2FA aan? Dan eerst de code vragen.
      const check = await fetch("/api/auth/2fa-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (check.status === 429) {
        setLoading(false);
        setError(t("tooManyAttempts"));
        return;
      }
      if (!check.ok) {
        setLoading(false);
        setError(t("invalidCredentials"));
        return;
      }
      const data = (await check.json()) as { needsTotp?: boolean };
      if (data.needsTotp) {
        setLoading(false);
        setStep("totp");
        return;
      }
    }

    const result = await signIn("credentials", { email, password, totp: step === "totp" ? totp : "", redirect: false });
    setLoading(false);

    if (result?.error) {
      setError(step === "totp" ? t("totpInvalid") : t("invalidCredentials"));
      return;
    }
    finish();
    } catch { setError(t("connectionFailed")); } finally { setLoading(false); }
  }

  // Stap 2: code uit de authenticator-app
  if (mode === "login" && step === "totp") {
    return (
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{t("totpTitle")}</p>
            <p className="text-xs text-slate-400">{t("totpHint")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="totp" className="text-sm font-medium text-slate-300">
            {t("totpLabel")}
          </label>
          <input
            ref={totpRef}
            id="totp"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            placeholder="123 456"
            autoComplete="one-time-code"
            inputMode="numeric"
            className="tabular rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-lg tracking-[0.3em] text-white placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            required
          />
        </div>
        <p className="text-xs text-slate-500">{t("totpBackupHint")}</p>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <Button type="submit" disabled={loading || totp.trim().length < 6}>
          {loading ? "..." : t("totpButton")}
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep("credentials");
            setTotp("");
            setError(null);
          }}
          className="text-sm text-slate-400 transition-colors hover:text-white"
        >
          {t("totpBack")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {mode === "register" && (
        <p className="text-sm text-slate-400">{t("registerHint")}</p>
      )}

      {mode === "register" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-300">{t("accountTypeLabel")}</span>
          <div className="grid grid-cols-2 gap-2">
            {(["ZZP", "BEDRIJF"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAccountType(type)}
                className={
                  accountType === type
                    ? "rounded-lg border-2 border-brand-500 bg-brand-500/15 px-4 py-2.5 text-sm font-semibold text-brand-200"
                    : "rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-400 hover:border-white/20"
                }
              >
                {type === "ZZP" ? t("accountTypeZzp") : t("accountTypeBedrijf")}
              </button>
            ))}
          </div>
          {accountType === "BEDRIJF" && (
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-300">{t("legalFormLabel")}</span>
              <div className="grid grid-cols-3 gap-2">
                {(["EENMANSZAAK", "VOF", "BV"] as const).map((lf) => (
                  <button
                    key={lf}
                    type="button"
                    onClick={() => setLegalForm(lf)}
                    className={
                      legalForm === lf
                        ? "rounded-lg border-2 border-brand-500 bg-brand-500/15 px-2 py-2 text-xs font-semibold text-brand-200"
                        : "rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-xs font-medium text-slate-400 hover:border-white/20"
                    }
                  >
                    {t(`legalForm${lf}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">{t("legalFormHint")}</p>
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{t("trialNote")}</p>
            </div>
          )}
        </div>
      )}

      <Input id="email" type="email" label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input id="password" type="password" label={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} required />

      {mode === "register" && (
        <div className="flex flex-col gap-2 rounded-lg bg-white/[0.03] p-3 text-sm">
          {(["terms", "privacy", "dpa"] as const).map((key) => (
            <label key={key} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={consent[key]}
                onChange={(e) => setConsent({ ...consent, [key]: e.target.checked })}
                className="mt-0.5 accent-brand-500"
                required
              />
              <span className="text-slate-400">{t(`consent.${key}`)}</span>
            </label>
          ))}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      <Button type="submit" disabled={loading || (mode === "register" && !allConsented)}>
        {loading ? "..." : mode === "login" ? t("loginButton") : t("registerButton")}
      </Button>
    </form>
  );
}
