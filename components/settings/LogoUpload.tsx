"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

// Eigen logo uploaden (PNG/JPG, max 1 MB). Opgeslagen als base64 op het
// bedrijfsprofiel en getoond op facturen, offertes en de publieke offertepagina.
export function LogoUpload({ initialLogo }: { initialLogo: string | null }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(initialLogo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string | null) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logo: value ?? "" }),
    });
    setBusy(false);
    if (res.ok) {
      setLogo(value);
      router.refresh();
    } else {
      setError(t("logoError"));
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError(t("logoType"));
      return;
    }
    if (file.size > 1024 * 1024) {
      setError(t("logoSize"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError(t("logoError"));
    reader.onload = () => save(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name="star" className="h-4 w-4" /></span>
        <h2 className="font-semibold text-white">{t("logoTitle")}</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">{t("logoDesc")}</p>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-slate-600" aria-hidden><Icon name="building" className="h-7 w-7" /></span>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} />
          <Button type="button" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "..." : logo ? t("logoReplace") : t("logoUpload")}
          </Button>
          {logo && (
            <button type="button" onClick={() => save(null)} disabled={busy} className="text-xs font-medium text-rose-400 hover:underline disabled:opacity-50">
              {t("logoRemove")}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </div>
  );
}
