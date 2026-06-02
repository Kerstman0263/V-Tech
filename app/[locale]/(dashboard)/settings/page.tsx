import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const session = await auth();

  const user = await db.user.findUnique({ where: { id: session!.user.id } });

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-bold">{t("title")}</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 font-semibold">{t("companyDetails")}</h2>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-gray-500">{t("companyDetails")}</dt>
          <dd>{user?.companyName ?? "—"}</dd>
          <dt className="text-gray-500">{t("kvkNumber")}</dt>
          <dd>{decrypt(user?.kvkNumber) ?? "—"}</dd>
          <dt className="text-gray-500">{t("vatNumber")}</dt>
          <dd>{decrypt(user?.vatNumber) ?? "—"}</dd>
          <dt className="text-gray-500">{t("language")}</dt>
          <dd>{user?.locale?.toUpperCase() ?? "NL"}</dd>
        </dl>
        <p className="mt-4 text-xs text-gray-400">
          {/* Bewerken van bedrijfsgegevens komt in een volgende iteratie. */}
        </p>
      </div>
    </div>
  );
}
