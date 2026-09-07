"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface Option {
  id: string;
  name: string;
}

export function ProjectForm({ customers }: { customers: Option[] }) {
  const t = useTranslations("projects");
  const router = useRouter();
  const [form, setForm] = useState({ name: "", customerId: "", description: "", hourlyRate: 0 });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        customerId: form.customerId || null,
        description: form.description || undefined,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ name: "", customerId: "", description: "", hourlyRate: 0 });
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
      <Input label={t("name")} className="col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Select
        label={t("customer")}
        value={form.customerId}
        onChange={(v) => setForm({ ...form, customerId: v })}
        options={[{ value: "", label: t("noCustomer") }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
      />
      <Input type="number" step="0.01" label={t("hourlyRate")} value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })} />
      <Input label={t("description")} className="col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="col-span-2">
        <Button type="submit" disabled={saving || !form.name}>
          {saving ? "..." : t("new")}
        </Button>
      </div>
    </form>
  );
}
