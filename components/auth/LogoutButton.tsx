"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

export function LogoutButton() {
  const t = useTranslations("common");
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm text-slate-400 hover:text-white"
    >
      {t("logout")}
    </button>
  );
}
