import { useTranslations } from "next-intl";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Icon } from "@/components/ui/Icon";
import { ContactForm } from "@/components/contact/ContactForm";

export default function ContactPage() {
  const t = useTranslations("contact");

  const channels = [
    { icon: "mail" as const, key: "emailChannel" },
    { icon: "clock" as const, key: "responseChannel" },
    { icon: "lock" as const, key: "privacyChannel" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />

      <section className="relative overflow-hidden pb-20">
        {/* Sfeerlaag: flinterdun dot-grid + zacht paars radiaal licht achter het formulier */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "28px 28px" }}
          />
          <div className="absolute right-0 top-40 h-[460px] w-[620px] max-w-full rounded-full bg-brand-500/5 blur-[150px]" />
          <div className="absolute left-0 top-10 h-[320px] w-[420px] max-w-full rounded-full bg-brand-600/[0.04] blur-[130px]" />
        </div>

        {/* Kop */}
        <div className="mx-auto max-w-3xl px-6 pb-12 pt-20 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">{t("title")}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">{t("subtitle")}</p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-8 px-6 lg:grid-cols-3">
          {/* Contactkaarten — glassmorphism + hover */}
          <div className="flex flex-col gap-4 lg:col-span-1">
            {channels.map((c) => (
              <div
                key={c.key}
                className="rounded-2xl border border-white/[0.04] bg-[#12112a]/30 p-5 backdrop-blur-md transition-all duration-300 hover:scale-[1.01] hover:border-brand-500/20 hover:bg-[#12112a]/50"
              >
                <span className="inline-flex rounded-xl bg-brand-500/10 p-2.5 text-brand-400">
                  <Icon name={c.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold text-white">{t(`${c.key}.title`)}</h3>
                <p className="mt-1 text-sm text-slate-400">{t(`${c.key}.text`)}</p>
              </div>
            ))}
          </div>

          {/* Formulier */}
          <div className="lg:col-span-2">
            <ContactForm />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
