import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseDesktopApp, isDesktopUserAgent } from "@/lib/desktop";
import { DesktopGate } from "@/components/desktop/DesktopGate";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileSidebar } from "@/components/dashboard/MobileSidebar";
import { CommandPalette } from "@/components/dashboard/CommandPalette";
import { UpdateNotice } from "@/components/dashboard/UpdateNotice";
import { WhatsNew } from "@/components/dashboard/WhatsNew";
import { newNavKeys } from "@/lib/whats-new";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { LATEST_DESKTOP_VERSION } from "@/lib/changelog";
import { accessState, ensureAccountSubscription, trialDaysLeft } from "@/lib/subscription";
import { TrialExpiredGate } from "@/components/billing/TrialExpiredGate";
import { PanelTheme } from "@/components/dashboard/PanelTheme";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SupportWidget } from "@/components/support/SupportWidget";
import { ProductTour } from "@/components/onboarding/ProductTour";
import { PageTours } from "@/components/onboarding/PageTours";
import type { TourVariant } from "@/components/onboarding/tour-steps";
import { isPaidPlan } from "@/lib/plans";
import { can } from "@/lib/permissions";
import type { Metadata } from "next";

// Private pages must always use the current session and account data.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Server-side auth-guard: alles onder (dashboard) vereist een sessie.
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const session = await auth();
  const { locale } = await params;
  const tAcc = await getTranslations("settings.accountant");
  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const [dbUser, account, hdrs] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, hasCompletedOnboarding: true, completedTours: true, hiddenModules: true, company: { select: { name: true } } },
    }),
    db.user.findUnique({ where: { id: session.user.accountId }, select: { subscription: { select: { plan: true } }, company: { select: { accountType: true } } } }),
    headers(),
  ]);
  // Sessie wijst naar een niet meer bestaande gebruiker (bijv. na een
  // database-reset of account-verwijdering) -> forceer opnieuw inloggen,
  // anders toont de UI verkeerde data (plan valt terug op FREE, lege naam).
  if (!dbUser) {
    redirect(`/${locale}/login`);
  }
  const displayName = dbUser.company?.name || dbUser.name || dbUser.email || "";
  const initials = displayName.slice(0, 2).toUpperCase();
  // Abonnement per doelgroep: zzp gratis/Groei/Pro, bedrijf 30 dagen proef op Business.
  // ensureAccountSubscription repareert oudere bedrijfsaccounts die nog op een zzp-plan staan.
  const accountType = (account?.company?.accountType ?? "ZZP") as "ZZP" | "BEDRIJF";
  const sub = await ensureAccountSubscription(session.user.accountId, accountType);
  const plan = sub.plan;
  const paid = isPaidPlan(plan);
  const isPlatformAdmin = ["ADMIN", "OWNER"].includes(session.user.role);
  const access = accessState(sub, accountType);
  const trialDays = access === "trial" ? trialDaysLeft(sub) : null;
  // Verlopen proefperiode (bedrijf): poort met plankeuze — beheerders nooit
  if (access === "expired" && !isPlatformAdmin) {
    return <TrialExpiredGate companyName={dbUser.company?.name || dbUser.name || dbUser.email || ""} />;
  }

  // Desktop-app (Windows) is een betaald voordeel. De shell identificeert
  // zich via de User-Agent; een gratis account krijgt in de app de upgrade-
  // poort in plaats van het dashboard. Web en telefoon blijven altijd open.
  const isDesktop = isDesktopUserAgent(hdrs.get("user-agent"));
  if (isDesktop && !canUseDesktopApp(plan, session.user.role as "USER" | "ADMIN" | "OWNER")) {
    return <DesktopGate accountType={(account?.company?.accountType as "ZZP" | "BEDRIJF") ?? "ZZP"} />;
  }

  const isOwner = session.user.id === session.user.accountId;
  // Team-link tonen voor eigenaar én leidinggevende
  const canTeam = can(session.user, "manageTeam");
  // Boekhouder (adviseur): financiën ja, personeel/verlof/taken niet — via de hidden-lijst
  const isAccountant = session.user.teamRole === "ACCOUNTANT";
  // "Nieuw"-labels in het menu voor functies jonger dan 30 dagen
  const newKeys = newNavKeys();
  const hiddenModules = isAccountant ? [...dbUser.hiddenModules, "leave", "tasks"] : dbUser.hiddenModules;
  // Fiscale Rust is alleen voor zzp'ers (niet voor 'Bedrijf'-accounts)
  const isZzp = (account?.company?.accountType ?? "ZZP") !== "BEDRIJF";
  // Financiële modules (facturen, BTW, omzet, klanten...) alleen voor de
  // account-eigenaar + platformbeheerder — niet voor medewerkers/managers.
  const canFinance = can(session.user, "financials");

  // Welke rondleiding krijgt deze gebruiker? Server-side beslist, zodat een
  // medewerker nooit een tour krijgt die naar de administratie wijst.
  const tourVariant: TourVariant = isZzp
    ? "ZZP"
    : isOwner || ["ADMIN", "OWNER"].includes(session.user.role)
      ? "BEDRIJF_OWNER"
      : "BEDRIJF_MEMBER";
  const showTour = !dbUser.hasCompletedOnboarding;

  return (
    // Premium dark werkvlak — sluit aan op de donkere zijbalk.
    <div data-panel={isZzp ? undefined : "bedrijf"} className="flex min-h-screen bg-[#080711] text-slate-200">
      {/* Paneelkleur ook op <html> zetten voor portals (rondleiding, Ctrl+K) */}
      <PanelTheme panel={isZzp ? "zzp" : "bedrijf"} />
      <Sidebar isAdmin={["ADMIN", "OWNER"].includes(session.user.role)} isOwner={isOwner} canTeam={canTeam} isZzp={isZzp} canFinance={canFinance} plan={plan} trialDaysLeft={trialDays} hidden={hiddenModules} newKeys={newKeys} />
      {/* min-w-0 is cruciaal: zonder deze regel groeit de flex-kolom mee met
          brede kinderen (tabellen) en valt de app buiten het scherm op mobiel. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* In de desktop-app is het venster randloos: deze header IS dan de
            titelbalk — sleepbaar, met rechts ruimte voor de vensterknoppen
            (minimaliseren/maximaliseren/sluiten) die de shell erover tekent. */}
        <header
          // paddingRight inline: reserveert ruimte voor de vensterknoppen. Als
          // Tailwind-klasse (pr-[150px]) verloor hij de CSS-cascade van sm:px-6,
          // waardoor de avatar half onder de knoppen-strook school.
          style={isDesktop ? ({ WebkitAppRegion: "drag", paddingRight: 150 } as React.CSSProperties) : undefined}
          className={cn(
            "sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/[0.06] px-4 py-3 sm:px-6",
            // In de app: DEKKENDE achtergrond in exact de kleur van het
            // vensterknoppen-blok (titleBarOverlay #080711) — een doorschijnende
            // header gaf daar een zichtbare naad onder de knoppen.
            isDesktop ? "bg-[#080711]" : "bg-[#080711]/70 backdrop-blur-md",
          )}
        >
          {/* Links: hamburger (alleen mobiel) */}
          <div style={isDesktop ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}>
            <MobileSidebar isAdmin={["ADMIN", "OWNER"].includes(session.user.role)} isOwner={isOwner} canTeam={canTeam} isZzp={isZzp} canFinance={canFinance} plan={plan} trialDaysLeft={trialDays} hidden={hiddenModules} newKeys={newKeys} />
          </div>
          {/* Rechts: zoeken (Ctrl+K), taal, uitloggen, avatar */}
          <div
            style={isDesktop ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
            className="flex items-center gap-3 sm:gap-4"
          >
            <WhatsNew />
            <CommandPalette isZzp={isZzp} canFinance={canFinance} canTeam={canTeam} isAdmin={["ADMIN", "OWNER"].includes(session.user.role)} hidden={hiddenModules} />
            {isAccountant && (
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 md:inline-flex">
                {tAcc("badge")}
              </span>
            )}
            {isDesktop && (
              <span className="hidden items-center gap-1.5 rounded-full border border-[#a855f7]/25 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-200 md:inline-flex">
                Desktop
              </span>
            )}
            <LocaleSwitcher />
            <LogoutButton />
            <div className="flex items-center gap-2 border-l border-white/10 pl-3 sm:pl-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-glow">
                {initials}
              </div>
              <span className="hidden text-sm font-medium text-slate-300 sm:block">{displayName}</span>
            </div>
          </div>
        </header>
        {/* Extra ruimte onderaan op telefoon voor de mobiele tabbalk. */}
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 p-4 !pb-24 sm:p-6 md:!pb-8 lg:p-8">{children}</main>
      </div>
      <SupportWidget isPaid={paid} />
      {/* Productrondleiding — eenmalig per gebruiker. Het component rendert
          zichzelf alleen op /dashboard (daar staan de ankers). */}
      {showTour && <ProductTour variant={tourVariant} />}
      {/* Per-pagina walkthroughs: eerste bezoek aan een pagina -> korte
          spotlight-tour. Volgt de route client-side (layout her-rendert niet
          bij navigatie); afgevinkte pagina's staan in completedTours. */}
      <PageTours completed={dbUser.completedTours} />
      {/* "Saldova is bijgewerkt"-melding: iedereen draait bij elke deploy
          automatisch de nieuwste versie; dit maakt dat één keer zichtbaar. */}
      <UpdateNotice version={LATEST_DESKTOP_VERSION} />
      {/* Telefoon: "zet Saldova op je beginscherm" (PWA) — alleen mobiel in de browser */}
      <InstallPrompt />
    </div>
  );
}
