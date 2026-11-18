import { useTranslations } from "next-intl";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Icon } from "@/components/ui/Icon";
import { ContactForm } from "@/components/contact/ContactForm";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "contact");
}

export default function ContactPage() {
  const t = useTranslations("contact");

  const channels = [
    { icon: "mail" as const, key: "emailChannel" },
    { icon: "clock" as const, key: "responseChannel" },
    { icon: "lock" as const, key: "privacyChannel" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-grond">
      <SiteHeader />

      <section className="relative overflow-hidden pb-20">
        {/* Eén zachte violette gloed achter de kop */}
        <div aria-hidden className="bg-hero-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" />

        {/* Kop */}
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-16 text-center sm:px-6 sm:pt-20">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{t("title")}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">{t("subtitle")}</p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-3">
          {/* Contactkaarten — glassmorphism + hover */}
          <div className="flex flex-col gap-4 lg:col-span-1">
            {channels.map((c) => (
              <div
                key={c.key}
                className="rounded-2xl border border-rand bg-kaart p-5"
              >
                <span className="inline-flex rounded-xl bg-saldova/15 p-2.5 text-saldova-licht">
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
