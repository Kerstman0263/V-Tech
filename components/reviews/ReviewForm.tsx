"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, fieldClass } from "@/components/ui/Input";
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
      <div role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-8 text-center text-white">
        <h3 className="text-lg font-semibold text-emerald-200">{t("successTitle")}</h3>
        <p className="mt-1 text-sm text-emerald-100/80">{t("successText")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-rand bg-kaart p-5 text-slate-200 sm:p-6">
      {/* Sterren */}
      <div className="flex flex-col gap-1">
        <span id="rf-rating" className="text-sm font-medium text-slate-300">{t("ratingLabel")}</span>
        <div role="radiogroup" aria-labelledby="rf-rating" className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}/5`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className={cn(
                "rounded text-2xl transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht",
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
        <label htmlFor="rf-body" className="text-sm font-medium text-slate-300">{t("body")}</label>
        <textarea
          id="rf-body"
          value={form.body}
          onChange={set("body")}
          rows={5}
          required
          minLength={10}
          maxLength={2000}
          className={fieldClass}
        />
      </div>

      {status === "error" && <p role="alert" className="text-sm text-rose-300">{t("error")}</p>}
      <p className="text-xs text-slate-400">{t("moderationNote")}</p>
      <Button type="submit" disabled={status === "sending"}>
        {status === "sending" ? "..." : t("submit")}
      </Button>
    </form>
  );
}
