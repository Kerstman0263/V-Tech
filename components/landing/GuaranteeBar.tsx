import { getTranslations } from "next-intl/server";

// Risico-omkering: vier geruststellende, WARE beloften onder de prijzen.
export async function GuaranteeBar() {
  const t = await getTranslations("landing");
  const items = ["free", "noCard", "cancel", "ownData"] as const;

  return (
    <div className="mx-auto mt-10 grid max-w-4xl gap-3 rounded-2xl border border-rand bg-kaart p-5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((key) => (
        <div key={key} className="flex items-center gap-2 text-sm text-slate-300">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-saldova/15 text-xs text-saldova-licht" aria-hidden>
            ✓
          </span>
          <span className="font-medium">{t(`guarantee.${key}`)}</span>
        </div>
      ))}
    </div>
  );
}
