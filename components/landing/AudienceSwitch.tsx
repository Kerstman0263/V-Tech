"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

// Toggle tussen 'Voor Solo-ZZP' en 'Voor MKB Teams' — diep-paars dark thema.
export function AudienceSwitch() {
  const t = useTranslations("home.switch");
  const [tab, setTab] = useState<"zzp" | "mkb">("zzp");

  const tabs: { key: "zzp" | "mkb"; icon: IconName; href: string }[] = [
    { key: "zzp", icon: "user", href: "/zzp" },
    { key: "mkb", icon: "users", href: "/bedrijven" },
  ];
  const active = tabs.find((x) => x.key === tab)!;

  return (
    <div>
      {/* Segmented toggle */}
      <div className="mx-auto flex w-fit items-center rounded-full border border-[#a855f7]/20 bg-[#16102E] p-1">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={cn(
              "flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200",
              tab === x.key ? "bg-brand-600 text-white shadow-[0_0_16px_rgba(124,58,237,0.4)]" : "text-[#c4b5fd] hover:text-white",
            )}
          >
            <Icon name={x.icon} className="h-4 w-4" />
            {t(`${x.key}Tab`)}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-[#a855f7]/20 bg-[#16102E] p-8 shadow-[0_0_40px_-12px_rgba(124,58,237,0.25)]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <h3 className="text-xl font-bold text-white">{t(`${tab}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#c4b5fd]">{t(`${tab}.desc`)}</p>
            <Link
              href={active.href}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(124,58,237,0.4)] transition-colors hover:bg-brand-500"
            >
              {t(`${tab}.cta`)} <span>→</span>
            </Link>
          </div>
          <ul className="flex flex-col gap-2.5 text-sm text-slate-200">
            {(t.raw(`${tab}.points`) as string[]).map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                  <Icon name="check" className="h-3 w-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
