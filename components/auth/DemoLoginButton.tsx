"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
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
        <Button
          type="button"
          onClick={demoLogin}
          disabled={loading}
          variant={solid ? "primary" : "secondary"}
          size="lg"
          className="px-7"
        >
          {/* Play-icoon */}
          <svg viewBox="0 0 24 24" className={cn("h-4 w-4", solid ? "text-saldova" : "text-saldova-licht")} fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          {loading ? t("demoLoading") : label ?? t("demoButton")}
        </Button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" onClick={demoLogin} disabled={loading} className="w-full border-dashed py-2.5">
        {loading ? t("demoLoading") : label ?? t("demoButton")}
      </Button>
      <p className="text-center text-xs text-slate-400">{t("demoHint")}</p>
      {error && <p className="text-center text-xs text-rose-400">{error}</p>}
    </div>
  );
}
