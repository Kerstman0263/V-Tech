"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export function CreateUserForm({ canCreateAdmin = false }: { canCreateAdmin?: boolean }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    companyName: "",
    role: "USER" as "USER" | "ADMIN",
    plan: "FREE" as "FREE" | "GROWTH" | "PRO" | "BUSINESS" | "BUSINESS_PLUS",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error");
      return;
    }
    setForm({ email: "", password: "", companyName: "", role: "USER", plan: "FREE" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ {t("newUser")}</Button>;
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl grid-cols-1 gap-3 rounded-xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 sm:grid-cols-2">
      <h2 className="col-span-2 font-semibold">{t("createTitle")}</h2>
      <Input label={t("company")} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
      <Input label={t("email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      <Input label="Wachtwoord" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
      <Select
        label={t("plan")}
        value={form.plan}
        onChange={(v) => setForm({ ...form, plan: v as typeof form.plan })}
        options={[
          { value: "FREE", label: "FREE" },
          { value: "GROWTH", label: "GROWTH" },
          { value: "PRO", label: "PRO" },
          { value: "BUSINESS", label: "BUSINESS" },
          { value: "BUSINESS_PLUS", label: "BUSINESS +" },
        ]}
      />
      <Select
        label={t("role")}
        value={form.role}
        onChange={(v) => setForm({ ...form, role: v as typeof form.role })}
        options={[
          { value: "USER", label: t("roles.USER") },
          // Admins benoemen kan alleen de eigenaar (API dwingt dit ook af)
          ...(canCreateAdmin ? [{ value: "ADMIN", label: t("roles.ADMIN") }] : []),
        ]}
      />
      {error && <p className="col-span-2 text-sm text-rose-400">{error}</p>}
      <div className="col-span-2 flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "..." : t("newUser")}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}
