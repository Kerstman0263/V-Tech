import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";
import { peekAuthToken } from "@/lib/auth-tokens";

// De link uit de mail: token vooraf controleren, zodat een verlopen link
// meteen een duidelijke melding geeft in plaats van pas na het invullen.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations("auth.reset");
  const { token = "" } = await searchParams;
  const valid = !!(await peekAuthToken(token, "PASSWORD_RESET"));

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="bg-hero-glow pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#12112a]/80 p-8 text-slate-200 shadow-2xl shadow-black/50 backdrop-blur-md">
        <h1 className="mb-4 text-2xl font-bold text-white">{t("resetTitle")}</h1>
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="flex flex-col gap-4">
            <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{t("expired")}</p>
            <Link href="/forgot-password" className="text-sm font-medium text-brand-400 hover:underline">{t("requestNew")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
