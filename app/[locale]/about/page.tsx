import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { DemoLoginButton } from "@/components/auth/DemoLoginButton";
import { OvaEi } from "@/components/ova-ei";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "about");
}

// Minimalistische, geometrische line-iconen in de merkkleur.
function ValueIcon({ name }: { name: "speed" | "privacy" | "simple" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-6 w-6",
  };
  if (name === "speed") return (<svg {...common}><path d="M13 2.5 4.5 13.5H10l-1 8 8.5-11H12z" /></svg>);
  if (name === "privacy") return (<svg {...common}><path d="M12 3l7 2.5v5.4c0 4.3-2.9 7.2-7 8.6-4.1-1.4-7-4.3-7-8.6V5.5z" /><path d="M9 12l2 2 4-4.5" /></svg>);
  // simple — essentie: van veel naar weinig
  return (<svg {...common}><path d="M4 7h16" /><path d="M4 12h11" /><path d="M4 17h6" /></svg>);
}

export default function AboutPage() {
  const t = useTranslations("about");
  const tl = useTranslations("landing");

  const values = [
    { key: "speed" as const },
    { key: "privacy" as const },
    { key: "simple" as const },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-grond">
      <SiteHeader />

      {/* 1. HERO — Onze missie */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          {/* Flinterdun dot-grid */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "28px 28px" }}
          />
          {/* Eén zachte violette gloed — diepte, maar tekst blijft goed leesbaar */}
          <div className="absolute left-1/2 top-8 h-[420px] w-[780px] max-w-full -translate-x-1/2 rounded-full blur-[130px]" style={{ background: "radial-gradient(circle, rgba(124,58,237,0.12), transparent 70%)" }} />
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-rand bg-kaart px-4 py-1.5 text-sm font-medium text-saldova-licht">
            {t("badge")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-5xl">{t("title")}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">{t("intro")}</p>
        </div>
      </section>

      {/* Onze achtergrond — ontstaan vanuit de praktijk */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-saldova-licht">{t("backgroundEyebrow")}</p>
            <h2 className="mx-auto mt-3 max-w-2xl text-balance text-2xl font-bold leading-snug text-white sm:text-3xl">
              {t("backgroundLead")}
            </h2>
          </div>
          <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-5 text-[15px] leading-relaxed text-slate-400">
            <p>{t("backgroundP1")}</p>
            <p>{t("backgroundP2")}</p>
            <p>{t("backgroundP3")}</p>
            <p className="border-l-2 border-saldova-licht/40 pl-4 text-slate-300">{t("backgroundP4")}</p>
          </div>
        </div>
      </section>

      {/* 2. KERNWAARDEN — drie-pijler-grid */}
      <section className="pb-6">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-slate-400">{t("valuesTitle")}</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {values.map((v) => (
              <div
                key={v.key}
                className="rounded-2xl border border-rand bg-kaart p-6"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-saldova/15 text-saldova-licht">
                  <ValueIcon name={v.key} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">{t(`values.${v.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t(`values.${v.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. FILOSOFIE — brede kaart met glanzende border-gradient bovenaan */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-rand bg-kaart p-6 sm:p-12">

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-wider text-saldova-licht">{t("philosophyEyebrow")}</p>
              <h2 className="mt-3 max-w-2xl text-2xl font-bold leading-snug text-white sm:text-3xl">{t("philosophyTitle")}</h2>
              <div className="mt-6 grid gap-5 text-[15px] leading-relaxed text-slate-400 md:grid-cols-2">
                <p>{t("philosophyBody1")}</p>
                <p>{t("philosophyBody2")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ova Groep — Saldova hoort bij een kleine familie van producten */}
      <section className="pb-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-rand bg-kaart p-6 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex shrink-0 items-center gap-2" aria-hidden>
              <OvaEi merk="saldova" className="h-8 w-auto" />
              <OvaEi merk="cloudova" className="h-8 w-auto" />
              <OvaEi merk="wardova" className="h-8 w-auto" />
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              {t("ovaGroup.text")}{" "}
              <a
                href="https://cloudova.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded font-semibold text-white underline underline-offset-4 hover:text-saldova-licht focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht"
              >
                {t("ovaGroup.cloudova")}
                <span className="sr-only"> ({t("ovaGroup.newTab")})</span>
              </a>
              {" · "}
              <a
                href="https://wardova.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded font-semibold text-white underline underline-offset-4 hover:text-saldova-licht focus-visible:outline focus-visible:outline-2 focus-visible:outline-saldova-licht"
              >
                {t("ovaGroup.wardova")}
                <span className="sr-only"> ({t("ovaGroup.newTab")})</span>
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* 4. CALL TO ACTION */}
      <section className="border-t border-rand py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-400">{t("ctaSubtitle")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
              {t("ctaButton")}
            </Link>
            <DemoLoginButton variant="hero" label={tl("hero.ctaDemo")} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
