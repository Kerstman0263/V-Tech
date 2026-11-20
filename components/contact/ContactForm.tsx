"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/Input";
import { STARTGESPREK_MINUTES, type ContactTopic } from "@/lib/contact-topics";

// Eén gedeelde veldstijl (uit Input.tsx) zodat Naam, E-mail, Onderwerp én Bericht
// exact hetzelfde ogen, met een duidelijk zichtbare focusring.
const FIELD = `${fieldClass} w-full`;

// `topic` komt uit ?onderwerp=… en is al gevalideerd (lib/contact-topics.ts).
export function ContactForm({ topic = null }: { topic?: ContactTopic | null }) {
  const t = useTranslations("contact");
  const initialSubject = topic ? t(`topics.${topic}.subject`) : "";
  const empty = { name: "", email: "", subject: initialSubject, message: "" };
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(topic ? { ...form, topic } : form),
    });
    if (res.ok) {
      setStatus("ok");
      setForm(empty);
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
        <p className="mt-1 text-sm text-slate-400">{topic ? t(`topics.${topic}.successText`) : t("successText")}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-2xl border border-rand bg-kaart p-5 sm:p-8"
    >
      {topic && (
        <div className="flex items-start gap-3 rounded-xl border border-saldova-licht/30 bg-saldova/10 p-4">
          <Icon name="calendar" className="mt-0.5 h-5 w-5 shrink-0 text-saldova-licht" />
          <div>
            <p className="font-semibold text-white">{t(`topics.${topic}.noteTitle`, { minutes: STARTGESPREK_MINUTES })}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{t(`topics.${topic}.noteText`)}</p>
          </div>
        </div>
      )}

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
          placeholder={topic ? t(`topics.${topic}.messagePlaceholder`) : t("messagePlaceholder")}
        />
      </div>

      {status === "error" && <p role="alert" className="text-sm text-rose-300">{t("error")}</p>}

      <Button type="submit" size="lg" disabled={status === "sending"} className="mt-1 w-full sm:w-auto sm:self-start">
        {status === "sending" ? "…" : t("send")}
      </Button>
    </form>
  );
}
