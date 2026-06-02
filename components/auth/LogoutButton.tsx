"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

export function LogoutButton() {
  const t = useTranslations("common");
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm text-gray-600 hover:text-gray-900"
    >
      {t("logout")}
    </button>
  );
}
