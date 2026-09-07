import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { AuthForm } from "@/components/auth/AuthForm";
import { DemoLoginButton } from "@/components/auth/DemoLoginButton";

export default function LoginPage() {
  const t = useTranslations("auth");
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="bg-hero-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-96 max-w-full -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#12112a]/80 p-8 text-slate-200 shadow-2xl shadow-black/50 backdrop-blur-md">
        <h1 className="mb-6 text-2xl font-bold text-white">{t("loginTitle")}</h1>
        <AuthForm mode="login" />

        <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          {t("or")}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <DemoLoginButton />

        <p className="mt-6 text-sm text-slate-400">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-brand-400 hover:underline">
            {t("registerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
