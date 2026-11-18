"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/Input";

// Eén gedeelde veldstijl (uit Input.tsx) zodat Naam, E-mail, Onderwerp én Bericht
// exact hetzelfde ogen, met een duidelijk zichtbare focusring.
const FIELD = `${fieldClass} w-full`;

export function ContactForm() {
  const t = useTranslations("contact");
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setStatus("ok");
      setForm({ name: "", email: "", subject: "", message: "" });
    } else {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div role="status" className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <Icon name="check-circle" className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-white">{t("successTitle")}</h3>
        <p className="mt-1 text-sm text-slate-400">{t("successText")}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-2xl border border-rand bg-kaart p-5 sm:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cf-name" className="text-sm font-medium text-slate-300">{t("name")}</label>
          <input id="cf-name" className={FIELD} value={form.name} onChange={set("name")} placeholder={t("namePlaceholder")} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cf-email" className="text-sm font-medium text-slate-300">{t("email")}</label>
          <input id="cf-email" type="email" className={FIELD} value={form.email} onChange={set("email")} placeholder={t("emailPlaceholder")} required />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cf-subject" className="text-sm font-medium text-slate-300">{t("subject")}</label>
        <input id="cf-subject" className={FIELD} value={form.subject} onChange={set("subject")} placeholder={t("subjectPlaceholder")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cf-message" className="text-sm font-medium text-slate-300">{t("message")}</label>
        <textarea
          id="cf-message"
          className={FIELD}
          value={form.message}
          onChange={set("message")}
          rows={6}
          required
          minLength={10}
          placeholder={t("messagePlaceholder")}
        />
      </div>

      {status === "error" && <p role="alert" className="text-sm text-rose-300">{t("error")}</p>}

      <Button type="submit" size="lg" disabled={status === "sending"} className="mt-1 w-full sm:w-auto sm:self-start">
        {status === "sending" ? "…" : t("send")}
      </Button>
    </form>
  );
}
