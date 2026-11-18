import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { setupProgress } from "@/lib/setup-progress";
import { Link } from "@/i18n/routing";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { SetupProfile } from "@/components/settings/SetupProfile";
import { SetupCustomer } from "@/components/settings/SetupCustomer";
import { ModuleToggles } from "@/components/settings/ModuleToggles";

const steps = ["profile", "customer", "invoice"] as const;
const paidPlans = ["growth", "pro", "webshop", "business", "business_plus"];

export default async function StartPage({ searchParams }: {
  searchParams: Promise<{ route?: string; step?: string; upgrade?: string }>;
}) {
  const user = await requireUser();
  if (user.id !== user.accountId) redirect("/dashboard");
  const params = await searchParams;
  const switching = params.route === "switch";
  const route = switching ? "switch" : "new";
  const upgrade = paidPlans.includes(params.upgrade ?? "") ? params.upgrade : undefined;
  const t = await getTranslations("setup");
  const tw = await getTranslations("setup.welcome");
  const [progress, owner] = await Promise.all([
    setupProgress(user.accountId),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: {
      hiddenModules: true, company: { select: { name: true, accountType: true } },
    } }),
  ]);
  const complete = progress.filter(Boolean).length;
  const requestedStep = steps.findIndex((step) => step === params.step);
  const firstIncomplete = progress.findIndex((done) => !done);
  const active = requestedStep >= 0 ? requestedStep : firstIncomplete >= 0 ? firstIncomplete : 2;
  const stepUrl = (step: string) => {
    const query = new URLSearchParams({ route, step });
    if (upgrade) query.set("upgrade", upgrade);
    return `/start?${query}`;
  };

  return <div className="mx-auto max-w-3xl space-y-5">
    <PageHeader title={tw(switching ? "switchTitle" : "title")} subtitle={tw("subtitle")} />
    <nav aria-label={tw("chooseRoute")} className="grid grid-cols-2 gap-3">
      {["new", "switch"].map((choice) => {
        const selected = route === choice;
        const query = new URLSearchParams({ route: choice });
        if (upgrade) query.set("upgrade", upgrade);
        return <Link key={choice} href={`/start?${query}`} aria-current={selected ? "page" : undefined}
          className={`rounded-2xl border p-3 transition-colors sm:p-4 ${selected ? "border-brand-400/60 bg-brand-500/10" : "border-white/10 hover:bg-white/5"}`}>
          <span className="block font-semibold text-white">{tw(`${choice}Choice`)}</span>
          <span className="mt-1 hidden text-sm text-slate-400 sm:block">{tw(`${choice}ChoiceHint`)}</span>
        </Link>;
      })}
    </nav>
    <Card className="p-5">
      <p className="text-sm font-semibold text-brand-200">{t("progress", { count: complete })}</p>
      <div role="progressbar" aria-label={t("title")} aria-valuemin={0} aria-valuemax={3} aria-valuenow={complete} className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${complete / 3 * 100}%` }} />
      </div>
      <ol className="mt-4 grid grid-cols-3 gap-2">
        {steps.map((step, index) => <li key={step}>
          <Link href={stepUrl(step)} aria-current={index === active ? "step" : undefined}
            className={`flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm ${index === active ? "bg-brand-500/15 text-white ring-1 ring-brand-400/40" : "text-slate-300 hover:bg-white/5"}`}>
            <span aria-hidden className="text-brand-300">{progress[index] ? "✓" : index + 1}</span>
            <span>{tw(`steps.${step}`)}{progress[index] && <span className="sr-only"> · {tw("completed")}</span>}</span>
          </Link>
        </li>)}
      </ol>
      <p className="mt-4 text-sm text-slate-400">{t(complete === 3 ? "complete" : "resume")}</p>
    </Card>
    <Card className="p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">{t(progress[active] ? "done" : "step", { number: active + 1 })}</p>
      <h2 className="mt-2 text-xl font-semibold text-white">{active === 1 && switching ? tw("importTitle") : t(`${steps[active]}Title`)}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{active === 1 && switching ? tw("importDesc") : t(`${steps[active]}Desc`)}</p>
      {active === 0 && <SetupProfile initialName={owner.company?.name ?? ""} />}
      {active === 1 && <SetupCustomer switching={switching} />}
      {active === 2 && <div className="mt-5 space-y-4">
        {switching && <p className="rounded-xl bg-white/5 p-4 text-sm leading-relaxed text-slate-300">{tw("startDate")}</p>}
        <Link href="/invoices/new" className="inline-flex rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-500">{t("invoiceAction")} →</Link>
      </div>}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4 text-sm">
        {active > 0 ? <Link href={stepUrl(steps[active - 1])} className="text-slate-300 hover:underline">← {tw("back")}</Link> : <span />}
        {active < 2 ? <Link href={stepUrl(steps[active + 1])} className="text-brand-300 hover:underline">{tw(progress[active] ? "next" : "skip")} →</Link> : <Link href="/dashboard" className="text-brand-300 hover:underline">{t("dashboard")} →</Link>}
      </div>
    </Card>
    <details className="rounded-2xl border border-white/10 p-5">
      <summary className="cursor-pointer font-semibold text-white">{t("modules")}</summary>
      <div className="mt-4"><ModuleToggles initialHidden={owner.hiddenModules} isZzp={owner.company?.accountType !== "BEDRIJF"} canFinance canTeam /></div>
    </details>
    {switching && <Card className="p-5">
      <h2 className="font-semibold text-white">{tw("transferTitle")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{tw("archive")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[{ href: "/bank", key: "bank" }, { href: "/expenses", key: "documents" }].map((item) => <Link key={item.key} href={item.href} className="rounded-xl border border-white/10 p-4 hover:bg-white/5">
          <span className="block text-sm font-semibold text-brand-300">{tw(`${item.key}Title`)} →</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-400">{tw(`${item.key}Desc`)}</span>
        </Link>)}
      </div>
      <Link href="/btw" className="mt-4 inline-flex text-sm font-semibold text-brand-300 hover:underline">{t("quarter")} →</Link>
    </Card>}
    {upgrade && <Card className="p-5"><p className="text-sm text-slate-300">{tw("planHint")}</p><Link href={`/settings?upgrade=${upgrade}`} className="mt-3 inline-flex text-sm font-semibold text-brand-300 hover:underline">{tw("planAction")} →</Link></Card>}
    <Link href="/dashboard" className="inline-flex text-sm text-slate-400 hover:underline">{tw("later")}</Link>
  </div>;
}
