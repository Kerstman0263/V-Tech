import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { AuthForm } from "@/components/auth/AuthForm";

export default function RegisterPage() {
  const t = useTranslations("auth");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold">{t("registerTitle")}</h1>
        <AuthForm mode="register" />
        <p className="mt-4 text-sm text-gray-600">
          {t("hasAccount")}{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            {t("loginLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
