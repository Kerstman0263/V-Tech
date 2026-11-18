"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function SetupProfile({ initialName }: { initialName: string }) {
  const t = useTranslations("setup");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  return <form className="mt-4 flex max-w-lg flex-col gap-3" onSubmit={async (e) => {
    e.preventDefault(); if (locked.current || !name.trim()) return;
    locked.current = true; setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyName: name.trim() }) });
      if (!res.ok) throw new Error();
      setMessage(t("saved")); router.refresh();
    } catch { setMessage(t("error")); }
    finally { locked.current = false; setSaving(false); }
  }}>
    <Input label={t("name")} value={name} maxLength={200} required onChange={(e) => setName(e.target.value)} />
    <p className="text-xs text-slate-400">{t("optionalOfficial")}</p>
    <div><Button type="submit" disabled={saving || !name.trim()}>{saving ? "…" : t("save")}</Button></div>
    <p role="status" className="text-sm text-slate-300">{message}</p>
  </form>;
}
