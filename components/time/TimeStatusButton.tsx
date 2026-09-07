"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";

// Markeert een uren-registratie als gefactureerd.
export function TimeStatusButton({ id, status }: { id: string; status: "OPEN" | "BILLED" }) {
  const t = useTranslations("time");
  const router = useRouter();

  if (status === "BILLED") {
    return <span className="text-xs font-medium text-emerald-400">{t("billed")}</span>;
  }

  async function markBilled() {
    await fetch(`/api/time-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "BILLED" }),
    });
    router.refresh();
  }

  return (
    <button onClick={markBilled} className="text-xs font-medium text-brand-400 hover:underline">
      {t("markBilled")}
    </button>
  );
}
