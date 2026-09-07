"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Accountant {
  email: string;
  name: string | null;
  createdAt: string;
}

/**
 * Boekhouder-toegang: nodig je boekhouder uit, die ziet dan je hele
 * financiële administratie (en kan corrigeren) — maar niet je personeel,
 * abonnement of bedrijfsinstellingen. Eén boekhouder per account.
 */
export function AccountantAccess() {
  const t = useTranslations("settings.accountant");
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [accountant, setAccountant] = useState<Accountant | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);

  async function load() {
    const res = await fetch("/api/team/accountant");
    if (res.ok) {
      const d = (await res.json()) as { allowed: boolean; accountant: Accountant | null };
      setAllowed(d.allowed);
      setAccountant(d.accountant);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/team/accountant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: name || undefined }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d?.error ?? t("error"));
      return;
    }
    setEmailed(!!d.emailed);
    setTempPassword(d.tempPassword ?? null);
    setEmail("");
    setName("");
    load();
  }

  async function revoke() {
    if (!confirm(t("revokeConfirm"))) return;
    setBusy(true);
    await fetch("/api/team/accountant", { method: "DELETE" });
    setBusy(false);
    setTempPassword(null);
    setEmailed(false);
    load();
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/20">
          <Icon name="briefcase" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-white">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-slate-400">{t("subtitle")}</p>
        </div>
      </div>

      {loading ? (
        <div className="skeleton mt-5 h-16 rounded-xl" aria-hidden />
      ) : accountant ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <Icon name="check-circle" className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-white">{accountant.name || accountant.email}</p>
                <p className="text-xs text-slate-400">
                  {accountant.email} · {t("since")} {new Date(accountant.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button onClick={revoke} disabled={busy} className="text-sm font-medium text-rose-400 hover:underline disabled:opacity-50">
              {t("revoke")}
            </button>
          </div>
          {tempPassword && (
            <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-200">{t("tempPasswordTitle")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("tempPasswordHint")}</p>
              <code className="mt-2 block select-all rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-white">{tempPassword}</code>
            </div>
          )}
          {emailed && <p className="mt-3 text-sm text-emerald-300">{t("emailed")}</p>}
          <p className="mt-3 text-xs text-slate-500">{t("scopeNote")}</p>
        </div>
      ) : !allowed ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-slate-300">{t("paidOnly")}</p>
          <Link href="/settings" className="mt-2 inline-block text-sm font-semibold text-brand-300 hover:text-brand-200">
            {t("upgrade")}
          </Link>
        </div>
      ) : (
        <form onSubmit={invite} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input type="email" label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="boekhouder@kantoor.nl" required />
          <Input label={t("name")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          <Button type="submit" disabled={busy || !email}>
            {busy ? "…" : t("invite")}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-rose-400 sm:col-span-3">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-500 sm:col-span-3">{t("scopeNote")}</p>
        </form>
      )}
    </Card>
  );
}
