"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";

export interface ProfileValues {
  name: string;
  accountType: "ZZP" | "BEDRIJF";
  legalForm?: "EENMANSZAAK" | "VOF" | "BV";
  companyName: string;
  kvkNumber: string;
  vatNumber: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  locale: "nl" | "en";
}

export function ProfileForm({ initial, isOwner, isPlatformAdmin = false }: { initial: ProfileValues; isOwner: boolean; isPlatformAdmin?: boolean }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [form, setForm] = useState<ProfileValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set =
    (key: keyof ProfileValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Accounttype (zzp/bedrijf) is een beheerdersbeslissing: gewone gebruikers sturen het niet mee.
      body: JSON.stringify(isPlatformAdmin ? form : { ...form, accountType: undefined }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      // Taalwissel direct toepassen op de UI
      router.refresh();
    }
  }

  return (
    <form data-tour="settings-profile" onSubmit={submit} className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
      {/* Persoonlijk — naam + taal (voor iedereen) */}
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name="user" className="h-4 w-4" /></span>
        <h2 className="font-semibold text-white">{t("personalDetails")}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label={t("name")} className="col-span-2" value={form.name} onChange={set("name")} />
        <Select
          label={t("language")}
          value={form.locale}
          onChange={(v) => setForm((prev) => ({ ...prev, locale: v as "nl" | "en" }))}
          options={[{ value: "nl", label: "Nederlands" }, { value: "en", label: "English" }]}
        />
      </div>

      {/* Bedrijfsgegevens — alleen de account-eigenaar mag deze wijzigen */}
      {isOwner && (
        <>
          <div className="mb-4 mt-7 flex items-center gap-2 border-t border-white/[0.06] pt-6">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name="building" className="h-4 w-4" /></span>
            <h2 className="font-semibold text-white">{t("companyDetails")}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Wisselen tussen zzp en bedrijf kan alleen een platformbeheerder.
                Gewone gebruikers zien het type niet: het is toch niet te wijzigen. */}
            {!isPlatformAdmin && (
              <p className="col-span-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                <span className="font-semibold text-slate-200">{t("accountTypeLabel")}: {form.accountType === "BEDRIJF" ? t("accountTypeBedrijf") : t("accountTypeZzp")}</span> — {t("accountTypeFixed")}
              </p>
            )}
            {isPlatformAdmin && (
              <Select
                className="col-span-2"
                label={t("accountTypeLabel")}
                value={form.accountType}
                onChange={(v) => setForm((p) => ({ ...p, accountType: v as "ZZP" | "BEDRIJF" }))}
                options={[{ value: "ZZP", label: t("accountTypeZzp") }, { value: "BEDRIJF", label: t("accountTypeBedrijf") }]}
              />
            )}
            {/* Rechtsvorm (bedrijven): bepaalt ib- of vpb-berekening in Fiscale Rust */}
            {form.accountType === "BEDRIJF" && (
              <div className="col-span-2">
                <Select
                  label={t("legalForm.label")}
                  value={form.legalForm ?? "EENMANSZAAK"}
                  onChange={(v) => setForm((p) => ({ ...p, legalForm: v as "EENMANSZAAK" | "VOF" | "BV" }))}
                  options={(["EENMANSZAAK", "VOF", "BV"] as const).map((lf) => ({ value: lf, label: t(`legalForm.${lf}`) }))}
                />
                <p className="mt-1 text-xs text-slate-500">{t("legalForm.hint")}</p>
              </div>
            )}
            <Input label={t("companyName")} className="col-span-2" value={form.companyName} onChange={set("companyName")} />
            <Input label={t("kvkNumber")} value={form.kvkNumber} onChange={set("kvkNumber")} />
            <Input label={t("vatNumber")} value={form.vatNumber} onChange={set("vatNumber")} />
            <Input label={t("address")} className="col-span-2" value={form.address} onChange={set("address")} />
            <Input label={t("postalCode")} value={form.postalCode} onChange={set("postalCode")} />
            <Input label={t("city")} value={form.city} onChange={set("city")} />
            <Input label={t("country")} value={form.country} onChange={set("country")} maxLength={2} />
          </div>
        </>
      )}

      <div className="mt-5 flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "..." : t("save")}
        </Button>
        {saved && <span className="text-sm text-emerald-400">{t("profileSaved")}</span>}
      </div>
    </form>
  );
}
