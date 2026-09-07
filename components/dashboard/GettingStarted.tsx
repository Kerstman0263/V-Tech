import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";

// Uitnodigende "aan de slag"-kaart voor nieuwe/lege accounts.
// Zzp: bedrijfsgegevens → klant → factuur. Bedrijf: medewerker → verlofbudget → factuur.
export async function GettingStarted({ variant = "zzp" }: { variant?: "zzp" | "bedrijf" }) {
  const t = await getTranslations("dashboard");
  const tb = await getTranslations("dashboard.gettingStartedBedrijf");

  const steps: { href: string; icon: IconName; title: string; desc: string }[] =
    variant === "bedrijf"
      ? [
          { href: "/team", icon: "users", title: tb("member_title"), desc: tb("member_desc") },
          { href: "/verlof", icon: "sun", title: tb("leave_title"), desc: tb("leave_desc") },
          { href: "/invoices/new", icon: "receipt", title: tb("invoice_title"), desc: tb("invoice_desc") },
        ]
      : [
          { href: "/settings", icon: "building", title: t("gettingStarted_company_title"), desc: t("gettingStarted_company_desc") },
          { href: "/customers", icon: "users", title: t("gettingStarted_customer_title"), desc: t("gettingStarted_customer_desc") },
          { href: "/invoices/new", icon: "receipt", title: t("gettingStarted_invoice_title"), desc: t("gettingStarted_invoice_desc") },
        ];

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-white">{t("gettingStartedTitle")}</h2>
        <p className="text-sm text-slate-400">{t("gettingStartedSub")}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <Link
            key={step.href}
            href={step.href}
            className="group relative flex flex-col gap-2 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/40"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300" aria-hidden>
                <Icon name={step.icon} className="h-4 w-4" />
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-xs font-bold text-slate-400 group-hover:bg-brand-600 group-hover:text-white">
                {i + 1}
              </span>
            </div>
            <p className="font-semibold text-white">{step.title}</p>
            <p className="text-sm text-slate-400">{step.desc}</p>
            <span className="mt-1 text-sm font-semibold text-brand-400 group-hover:underline">
              {t("gettingStartedCta")} →
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
