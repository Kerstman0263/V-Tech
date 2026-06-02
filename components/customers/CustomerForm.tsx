"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function CustomerForm() {
  const t = useTranslations("customers");
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    address: "",
    postalCode: "",
    city: "",
    vatNumber: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ name: "", email: "", address: "", postalCode: "", city: "", vatNumber: "" });
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-xl grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-5">
      <Input label={t("name")} value={form.name} onChange={set("name")} required className="col-span-2" />
      <Input label={t("email")} type="email" value={form.email} onChange={set("email")} className="col-span-2" />
      <Input label={t("address")} value={form.address} onChange={set("address")} className="col-span-2" />
      <Input label={t("postalCode")} value={form.postalCode} onChange={set("postalCode")} />
      <Input label={t("city")} value={form.city} onChange={set("city")} />
      <Input label={t("vatNumber")} value={form.vatNumber} onChange={set("vatNumber")} className="col-span-2" />
      <div className="col-span-2">
        <Button type="submit" disabled={saving || !form.name}>
          {saving ? "..." : t("new")}
        </Button>
      </div>
    </form>
  );
}
