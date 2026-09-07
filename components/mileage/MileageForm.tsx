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

export function MileageForm({ projects }: { projects: Option[] }) {
  const t = useTranslations("mileage");
  const router = useRouter();
  const [form, setForm] = useState({
    projectId: "",
    fromAddress: "",
    toAddress: "",
    distanceKm: 0,
    type: "BUSINESS" as "BUSINESS" | "PRIVATE",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/mileage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: form.projectId || null,
        fromAddress: form.fromAddress,
        toAddress: form.toAddress,
        distanceKm: Number(form.distanceKm),
        type: form.type,
        description: form.description || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("upgradeRequired"));
      return;
    }
    setForm({ projectId: "", fromAddress: "", toAddress: "", distanceKm: 0, type: "BUSINESS", description: "" });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
      <Input label={t("from")} value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} required />
      <Input label={t("to")} value={form.toAddress} onChange={(e) => setForm({ ...form, toAddress: e.target.value })} required />
      <Input type="number" step="0.1" label={t("distance")} value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: Number(e.target.value) })} />
      <Select
        label={t("type")}
        value={form.type}
        onChange={(v) => setForm({ ...form, type: v as "BUSINESS" | "PRIVATE" })}
        options={[{ value: "BUSINESS", label: t("business") }, { value: "PRIVATE", label: t("private") }]}
      />
      <Select
        className="col-span-2"
        label={t("project")}
        value={form.projectId}
        onChange={(v) => setForm({ ...form, projectId: v })}
        options={[{ value: "", label: "—" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
      />
      <Input label={t("description")} className="col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      {error && <p className="col-span-2 text-sm text-rose-400">{error}</p>}
      <div className="col-span-2">
        <Button type="submit" disabled={saving || !form.fromAddress || !form.toAddress}>
          {saving ? "..." : t("new")}
        </Button>
      </div>
    </form>
  );
}
