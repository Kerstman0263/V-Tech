"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/ui/Icon";

export function PasswordForm() {
  const t = useTranslations("settings");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ ok: true, text: t("passwordChanged") });
      setCurrent("");
      setNext("");
    } else {
      setMsg({ ok: false, text: t("passwordError") });
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300"><Icon name="lock" className="h-4 w-4" /></span>
        <h2 className="font-semibold text-white">{t("password")}</h2>
      </div>
      <div className="grid max-w-md grid-cols-1 gap-3">
        <Input type="password" label={t("currentPassword")} value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <Input type="password" label={t("newPassword")} value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button type="submit" disabled={saving || !current || next.length < 8}>
          {saving ? "..." : t("changePassword")}
        </Button>
        {msg && (
          <span className={msg.ok ? "text-sm text-emerald-400" : "text-sm text-rose-400"}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
