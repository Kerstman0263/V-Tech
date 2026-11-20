"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatInvoiceNumber } from "@/lib/invoice-settings";

export interface InvoiceSettingsValues {
  invoicePrefix: string;
  nextNumber: number;
  numberPadding: number;
  defaultVatRate: number;
  korEnabled: boolean;
  defaultDueDays: number;
  defaultCurrency: string;
  defaultNotes: string;
  footerText: string;
  paymentTerms: string;
  accentColor: string;
  quotePrefix: string;
  quoteNextNumber: number;
  quotePadding: number;
  reminderEnabled: boolean;
  reminderIntervalDays: number;
  reminderMaxCount: number;
}

/** Alleen de eigenaar wijzigt deze velden (zie lib/invoice-settings-change.ts). */
const OWNER_ONLY: (keyof InvoiceSettingsValues)[] = ["paymentTerms", "korEnabled", "accentColor", "footerText"];

export function InvoiceSettingsForm({ initial, isOwner = true }: { initial: InvoiceSettingsValues; isOwner?: boolean }) {
  const t = useTranslations("invoiceSettings");
  const tc = useTranslations("settings");
  const router = useRouter();
  const [form, setForm] = useState<InvoiceSettingsValues>(initial);
  // Wat er nu opgeslagen is: alleen wat daarvan afwijkt gaat mee, zodat een
  // oude teller (bijv. na het verwijderen van een concept) nooit terugkomt.
  const [base, setBase] = useState<InvoiceSettingsValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownerLocked = !isOwner;

  const num = (k: keyof InvoiceSettingsValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: Number(e.target.value) }));
  const str = (k: keyof InvoiceSettingsValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const preview = formatInvoiceNumber(form.invoicePrefix, form.nextNumber, form.numberPadding);
  const quotePreview = formatInvoiceNumber(form.quotePrefix, form.quoteNextNumber, form.quotePadding);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const changes = Object.fromEntries(
      (Object.keys(form) as (keyof InvoiceSettingsValues)[])
        .filter((key) => form[key] !== base[key] && !(ownerLocked && OWNER_ONLY.includes(key)))
        .map((key) => [key, form[key]]),
    );
    if (Object.keys(changes).length === 0) { setSaving(false); setSaved(true); return; }
    try {
      const res = await fetch("/api/invoice-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const issue = body?.issues?.fieldErrors ? Object.values(body.issues.fieldErrors).flat()[0] : null;
        setError(String(issue ?? body?.error ?? t("saveError")));
        return;
      }
      setBase(form);
      setSaved(true);
      router.refresh();
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {/* Nummering */}
      <div className="rounded-2xl border border-white/[0.06] bg-kaart backdrop-blur-md p-5">
        <h2 className="font-semibold">{t("numberingTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-slate-400">{t("numberingDesc")}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Input label={t("prefix")} value={form.invoicePrefix} onChange={str("invoicePrefix")} placeholder="2026-" />
          <Input type="number" label={t("nextNumber")} value={form.nextNumber} onChange={num("nextNumber")} min={1} />
          <Input type="number" label={t("padding")} value={form.numberPadding} onChange={num("numberPadding")} min={1} max={10} />
        </div>
        <p className="mt-3 text-sm text-slate-400">
          {t("preview")}: <span className="rounded-md bg-white/5 px-2 py-1 font-mono font-medium text-slate-200">{preview}</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{t("numberingRules")}</p>
      </div>

      {/* Standaarden */}
      <div className="rounded-2xl border border-white/[0.06] bg-kaart backdrop-blur-md p-5">
        <h2 className="font-semibold">{t("defaultsTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-slate-400">{t("defaultsDesc")}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Input type="number" step="0.01" label={t("defaultVat")} value={form.defaultVatRate} onChange={num("defaultVatRate")} />
          <Input type="number" label={t("dueDays")} value={form.defaultDueDays} onChange={num("defaultDueDays")} />
          <Input label={t("currency")} value={form.defaultCurrency} onChange={str("defaultCurrency")} maxLength={3} />
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-300">{t("defaultNotes")}</label>
          <textarea value={form.defaultNotes} onChange={str("defaultNotes")} rows={2} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500" />
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-300">{t("paymentTerms")}</label>
          <textarea value={form.paymentTerms} onChange={str("paymentTerms")} rows={2} placeholder="IBAN NL.. t.n.v. ..." disabled={ownerLocked} aria-describedby="payment-terms-hint" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 disabled:opacity-60" />
          <p id="payment-terms-hint" className="text-xs leading-relaxed text-slate-400">{ownerLocked ? t("ownerOnlyHint") : t("paymentTermsHint")}</p>
        </div>
        {/* KOR — kleineondernemersregeling */}
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <input
            type="checkbox"
            checked={form.korEnabled}
            onChange={(e) => setForm((p) => ({ ...p, korEnabled: e.target.checked }))}
            disabled={ownerLocked}
            className="mt-0.5 h-4 w-4 accent-brand-500"
          />
          <span className="text-sm">
            <span className="font-medium text-slate-200">{t("korLabel")}</span>
            <span className="mt-0.5 block text-xs text-slate-400">{t("korHint")}</span>
          </span>
        </label>
      </div>

      {/* Huisstijl */}
      <div className="rounded-2xl border border-white/[0.06] bg-kaart backdrop-blur-md p-5">
        <h2 className="font-semibold">{t("brandingTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-slate-400">{t("brandingDesc")}</p>
        {ownerLocked && <p className="mb-4 text-xs text-amber-200">{t("ownerOnlyHint")}</p>}
        <div className="flex items-center gap-4">
          <input type="color" value={form.accentColor} onChange={str("accentColor")} disabled={ownerLocked} className="h-11 w-16 cursor-pointer rounded-lg border border-white/10 disabled:cursor-not-allowed" aria-label={t("accentColor")} />
          <Input label={t("accentColor")} value={form.accentColor} onChange={str("accentColor")} disabled={ownerLocked} className="w-40 font-mono" />
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-300">{t("footerText")}</label>
          <textarea value={form.footerText} onChange={str("footerText")} rows={2} disabled={ownerLocked} aria-describedby="footer-text-hint" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 disabled:opacity-60" />
          <p id="footer-text-hint" className="text-xs leading-relaxed text-slate-400">{t("footerTextHint")}</p>
        </div>
      </div>

      {/* Offerte-nummering */}
      <div className="rounded-2xl border border-white/[0.06] bg-kaart backdrop-blur-md p-5">
        <h2 className="font-semibold">{t("quoteNumberingTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-slate-400">{t("quoteNumberingDesc")}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Input label={t("prefix")} value={form.quotePrefix} onChange={str("quotePrefix")} placeholder="OFF-" />
          <Input type="number" label={t("nextNumber")} value={form.quoteNextNumber} onChange={num("quoteNextNumber")} min={1} />
          <Input type="number" label={t("padding")} value={form.quotePadding} onChange={num("quotePadding")} min={1} max={10} />
        </div>
        <p className="mt-3 text-sm text-slate-400">
          {t("preview")}: <span className="rounded-md bg-white/5 px-2 py-1 font-mono font-medium text-slate-200">{quotePreview}</span>
        </p>
      </div>

      {/* Automatische betaalherinneringen */}
      <div className="rounded-2xl border border-white/[0.06] bg-kaart backdrop-blur-md p-5">
        <h2 className="font-semibold">{t("reminderTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-slate-400">{t("reminderDesc")}</p>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={form.reminderEnabled}
            onChange={(e) => setForm((p) => ({ ...p, reminderEnabled: e.target.checked }))}
            className="h-4 w-4 rounded border-white/10"
          />
          {t("reminderEnabled")}
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Input type="number" label={t("reminderInterval")} value={form.reminderIntervalDays} onChange={num("reminderIntervalDays")} min={1} max={90} disabled={!form.reminderEnabled} />
          <Input type="number" label={t("reminderMax")} value={form.reminderMaxCount} onChange={num("reminderMaxCount")} min={0} max={10} disabled={!form.reminderEnabled} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>{saving ? "..." : tc("save")}</Button>
        {saved && <span className="text-sm text-emerald-400">{tc("saved")}</span>}
        {error && <span role="alert" className="text-sm text-rose-400">{error}</span>}
      </div>
    </form>
  );
}
