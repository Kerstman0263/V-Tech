"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// Stap 1: e-mailadres invullen. Het antwoord is altijd hetzelfde, ook als
// het adres niet bestaat (geen account-enumeratie).
export function ForgotPasswordForm() {
  const t = useTranslations("auth.reset");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "noEmail">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setState("idle");
        setError(t("tooMany"));
        return;
      }
      if (!res.ok) {
        setState("idle");
        setError(t("invalidEmail"));
        return;
      }
      const data = (await res.json()) as { emailConfigured?: boolean };
      setState(data.emailConfigured === false ? "noEmail" : "sent");
    } catch {
      setState("idle");
      setError(t("connectionFailed"));
    }
  }

  if (state === "sent" || state === "noEmail") {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className={
            state === "sent"
              ? "rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
              : "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
          }
        >
          {state === "sent" ? t("sent", { email }) : t("noEmail")}
        </p>
        <Link href="/login" className="text-sm font-medium text-brand-400 hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">{t("forgotHint")}</p>
      <Input id="email" type="email" label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      <Button type="submit" disabled={state === "loading"}>
        {state === "loading" ? "..." : t("sendButton")}
      </Button>
      <Link href="/login" className="text-sm text-slate-400 transition-colors hover:text-white">
        {t("backToLogin")}
      </Link>
    </form>
  );
}

// Stap 2: nieuw wachtwoord kiezen via de link uit de mail.
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth.reset");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    if (password.length < 8) return setError(t("tooShort"));
    if (password !== confirm) return setError(t("mismatch"));
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setState("idle");
        setError(res.status === 400 ? t("expired") : res.status === 429 ? t("tooMany") : data.error ?? t("expired"));
        return;
      }
      setState("done");
    } catch {
      setState("idle");
      setError(t("connectionFailed"));
    }
  }

  if (state === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {t("done")}
        </p>
        <Link href="/login" className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
          {t("toLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">{t("resetHint")}</p>
      <Input id="password" type="password" label={t("newPassword")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
      <Input id="confirm" type="password" label={t("confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}{" "}
          {error === t("expired") && (
            <Link href="/forgot-password" className="font-medium text-brand-400 hover:underline">{t("requestNew")}</Link>
          )}
        </p>
      )}
      <Button type="submit" disabled={state === "loading"}>
        {state === "loading" ? "..." : t("saveButton")}
      </Button>
    </form>
  );
}
