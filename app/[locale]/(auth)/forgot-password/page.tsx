import { useTranslations } from "next-intl";
import { ForgotPasswordForm } from "@/components/auth/PasswordResetForms";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.reset");
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="bg-hero-glow pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#12112a]/80 p-8 text-slate-200 shadow-2xl shadow-black/50 backdrop-blur-md">
        <h1 className="mb-4 text-2xl font-bold text-white">{t("forgotTitle")}</h1>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
