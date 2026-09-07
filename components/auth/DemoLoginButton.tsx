"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";

// Eén-klik login op het gedeelde demo-account.
// `variant`: "auth" = lichte loginpagina, "hero" = donkere marketing-hero.
export function DemoLoginButton({
  variant = "auth",
  label,
  solid = false,
}: {
  variant?: "auth" | "hero";
  label?: string;
  /** Solide felpaarse knop (primaire CTA) i.p.v. glas-variant. */
  solid?: boolean;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function demoLogin() {
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError(t("demoMissing"));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (variant === "hero") {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={demoLogin}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-semibold transition-all duration-200 disabled:opacity-60",
            solid
              ? "bg-brand-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] hover:bg-brand-500 hover:shadow-[0_0_28px_rgba(124,58,237,0.55)]"
              : "border border-white/15 bg-white/[0.05] text-white backdrop-blur hover:bg-white/[0.1]",
          )}
        >
          {/* Play-icoon */}
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-300" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          {loading ? t("demoLoading") : label ?? t("demoButton")}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={demoLogin}
        disabled={loading}
        className={cn(
          "w-full rounded-lg border border-dashed border-brand-500/40 bg-brand-500/10 px-4 py-2.5 text-sm font-semibold text-brand-200 transition-colors hover:bg-brand-500/20 disabled:opacity-50",
        )}
      >
        {loading ? "..." : label ?? t("demoButton")}
      </button>
      <p className="text-center text-xs text-slate-500">{t("demoHint")}</p>
      {error && <p className="text-center text-xs text-rose-400">{error}</p>}
    </div>
  );
}
