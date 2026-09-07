import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/ui/Icon";

// Eerlijke vertrouwens-/feitenbalk: alleen claims die nú waar zijn.
// (Geen verzonnen gebruikersaantallen.)
export async function TrustBar() {
  const t = await getTranslations("landing");

  const items = [
    { icon: "briefcase" as const, key: "threeInOne" },
    { icon: "lock" as const, key: "gdpr" },
    { icon: "shield" as const, key: "madeInNl" },
    { icon: "wallet" as const, key: "ideal" },
    { icon: "check-circle" as const, key: "cancel" },
  ] as const;

  return (
    <div className="border-y border-white/[0.06] bg-white/[0.02]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-5 text-sm text-slate-400">
        {items.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2">
            <Icon name={item.icon} className="h-4 w-4 text-brand-400" />
            <span className="font-medium">{t(`trustBar.${item.key}`)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
