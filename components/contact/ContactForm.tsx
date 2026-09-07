"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";

// Eén gedeelde veldstijl zodat Naam, E-mail, Onderwerp én Bericht exact
// hetzelfde ogen — donker, met een subtiele paarse focus-glow.
const FIELD =
  "w-full rounded-xl border border-white/[0.08] bg-[#12112a]/40 px-4 py-3 text-sm text-white placeholder-slate-500 transition-all duration-200 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(124,58,237,0.15)]";

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
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-8 text-center backdrop-blur-md">
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
      className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8"
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

      {status === "error" && <p className="text-sm text-rose-400">{t("error")}</p>}

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-1 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white transition-all duration-300 hover:bg-brand-500 hover:shadow-[0_0_20px_rgba(124,58,237,0.4)] active:scale-[0.98] disabled:opacity-60"
      >
        {status === "sending" ? "…" : t("send")}
      </button>
    </form>
  );
}
