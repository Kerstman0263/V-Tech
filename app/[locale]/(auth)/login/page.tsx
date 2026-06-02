import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { AuthForm } from "@/components/auth/AuthForm";

export default function LoginPage() {
  const t = useTranslations("auth");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold">{t("loginTitle")}</h1>
        <AuthForm mode="login" />
        <p className="mt-4 text-sm text-gray-600">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-brand-600 hover:underline">
            {t("registerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
