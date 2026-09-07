import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PaymentReturnPage() {
  const t = await getTranslations("paymentReturn");
  return <div className="flex min-h-screen flex-col bg-surface">
    <SiteHeader />
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-20">
      <div className="rounded-2xl border border-white/10 bg-[#12112a] p-6">
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
        <p className="mt-4 text-slate-300">{t("description")}</p>
        <p className="mt-4 text-sm text-slate-400">{t("help")}</p>
      </div>
    </main>
    <SiteFooter />
  </div>;
}
