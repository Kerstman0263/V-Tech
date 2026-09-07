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

export function TimeForm({ projects, customers }: { projects: Option[]; customers: Option[] }) {
  const t = useTranslations("time");
  const router = useRouter();
  const [form, setForm] = useState({
    projectId: "",
    customerId: "",
    hours: 1,
    hourlyRate: 0,
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: form.projectId || null,
        customerId: form.customerId || null,
        hours: Number(form.hours),
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
        description: form.description,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("upgradeRequired"));
      return;
    }
    setForm({ projectId: "", customerId: "", hours: 1, hourlyRate: 0, description: "" });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
      <Select
        label={t("project")}
        value={form.projectId}
        onChange={(v) => setForm({ ...form, projectId: v })}
        options={[{ value: "", label: "—" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
      />
      <Select
        label={t("customer")}
        value={form.customerId}
        onChange={(v) => setForm({ ...form, customerId: v })}
        options={[{ value: "", label: "—" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
      />
      <Input
        type="number"
        step="0.25"
        label={t("hours")}
        value={form.hours}
        onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
      />
      <Input
        type="number"
        step="0.01"
        label={t("hourlyRate")}
        value={form.hourlyRate}
        onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })}
      />
      <Input
        label={t("description")}
        className="col-span-2"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        required
      />
      {error && <p className="col-span-2 text-sm text-rose-400">{error}</p>}
      <div className="col-span-2">
        <Button type="submit" disabled={saving || !form.description}>
          {saving ? "..." : t("new")}
        </Button>
      </div>
    </form>
  );
}
