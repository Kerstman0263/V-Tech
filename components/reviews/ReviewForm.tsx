"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function ReviewForm() {
  const t = useTranslations("reviews");
  const [form, setForm] = useState({ name: "", role: "", email: "", body: "" });
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, rating }),
    });
    if (res.ok) {
      setStatus("ok");
      setForm({ name: "", role: "", email: "", body: "" });
      setRating(5);
    } else {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-8 text-center text-white">
        <div className="text-3xl">🙏</div>
        <h3 className="mt-3 text-lg font-semibold text-emerald-800">{t("successTitle")}</h3>
        <p className="mt-1 text-sm text-emerald-700">{t("successText")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#12112a]/80 p-6 text-slate-200 shadow-2xl shadow-black/40 backdrop-blur-md">
      {/* Sterren */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-300">{t("ratingLabel")}</label>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className={cn(
                "text-2xl transition-transform hover:scale-110",
                n <= (hover || rating) ? "text-amber-400" : "text-slate-600",
              )}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t("name")} value={form.name} onChange={set("name")} required />
        <Input label={t("role")} value={form.role} onChange={set("role")} placeholder={t("rolePlaceholder")} />
      </div>
      <Input label={t("email")} type="email" value={form.email} onChange={set("email")} placeholder={t("emailHint")} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-300">{t("body")}</label>
        <textarea
          value={form.body}
          onChange={set("body")}
          rows={5}
          required
          minLength={10}
          maxLength={2000}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {status === "error" && <p className="text-sm text-rose-400">{t("error")}</p>}
      <p className="text-xs text-slate-500">{t("moderationNote")}</p>
      <Button type="submit" disabled={status === "sending"}>
        {status === "sending" ? "..." : t("submit")}
      </Button>
    </form>
  );
}
