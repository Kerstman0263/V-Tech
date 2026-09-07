import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";

/**
 * Herbruikbare template voor juridische pagina's (privacy, voorwaarden, DPA).
 * De inhoud komt als `children` en wordt in een `prose prose-invert`-container
 * gezet, zodat je er later gewoon platte tekst / headings in kunt plakken en
 * het meteen strak oogt op de donkere site.
 */
export function LegalPage({
  title,
  updatedLabel,
  children,
}: {
  title: string;
  /** Bijv. "Laatst bijgewerkt: 15 juli 2026". */
  updatedLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />

      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div aria-hidden className="bg-hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">{title}</h1>
          {updatedLabel && <p className="mt-3 text-sm text-slate-500">{updatedLabel}</p>}
        </div>
      </section>

      <section className="py-14">
        <article
          className="prose prose-invert mx-auto max-w-3xl px-6
            prose-headings:font-bold prose-headings:tracking-tight
            prose-h2:mt-10 prose-h2:text-2xl prose-h2:text-white
            prose-h3:text-lg prose-h3:text-white
            prose-p:text-slate-300 prose-p:leading-relaxed
            prose-li:text-slate-300 prose-strong:text-white
            prose-a:text-brand-400 prose-a:no-underline hover:prose-a:underline"
        >
          {children}
        </article>
      </section>

      <SiteFooter />
    </div>
  );
}
