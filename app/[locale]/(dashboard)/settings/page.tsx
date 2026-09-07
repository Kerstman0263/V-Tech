import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { PLANS } from "@/lib/plans";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { ModuleToggles } from "@/components/settings/ModuleToggles";
import { LogoUpload } from "@/components/settings/LogoUpload";
import { can } from "@/lib/permissions";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { TwoFactorCard } from "@/components/settings/TwoFactorCard";
import { AccountantAccess } from "@/components/settings/AccountantAccess";
import { InboundMailCard } from "@/components/settings/InboundMailCard";
import { BillingPanel } from "@/components/settings/BillingPanel";
import { DangerZone } from "@/components/settings/DangerZone";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const tp = await getTranslations("pricing");
  const user = await requireUser();
  const isOwner = user.id === user.accountId;

  const [dbUser, account, company] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, locale: true, hiddenModules: true, totpEnabled: true } }),
    db.user.findUnique({ where: { id: user.accountId }, include: { subscription: true } }),
    db.company.findUnique({ where: { userId: user.accountId } }),
  ]);

  const displayName = company?.name || dbUser?.name || dbUser?.email || "";
  const initials = displayName.slice(0, 2).toUpperCase();
  const plan = account?.subscription?.plan ?? "FREE";
  const accountType = (company?.accountType as "ZZP" | "BEDRIJF") ?? "ZZP";
  const isZzp = accountType !== "BEDRIJF";
  const canFinance = can(user, "financials");
  const canTeam = isOwner || user.teamRole === "MANAGER";

  return (
    <div className="relative max-w-3xl">
      {/* Zachte sfeergloed op de achtergrond */}
      <div aria-hidden className="pointer-events-none absolute -top-10 right-0 -z-0 h-64 w-64 rounded-full bg-brand-500/10 blur-[110px]" />

      <div className="relative">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        <div className="flex flex-col gap-6">
          {/* Account-overzicht — premium banner */}
          <div data-tour="settings-account-overview" className="relative overflow-hidden rounded-3xl border border-[#7c3aed]/20 bg-gradient-to-br from-[#1e1145] to-[#0f0a26] p-6 shadow-xl shadow-black/30">
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xl font-bold text-white shadow-glow-md">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold text-white">{displayName}</p>
                <p className="truncate text-sm text-slate-400">{dbUser?.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/10">
                  <Icon name={accountType === "BEDRIJF" ? "building" : "user"} className="h-3.5 w-3.5" />
                  {t(accountType === "BEDRIJF" ? "accountTypeBedrijf" : "accountTypeZzp")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-200 ring-1 ring-brand-500/20">
                  <Icon name="star" className="h-3.5 w-3.5" />
                  {tp(`plans.${PLANS[plan].key}.name`)}
                </span>
              </div>
            </div>
          </div>

        <ProfileForm
          isOwner={isOwner}
          isPlatformAdmin={user.role === "ADMIN" || user.role === "OWNER"}
          initial={{
            name: dbUser?.name ?? "",
            accountType: (company?.accountType as "ZZP" | "BEDRIJF") ?? "ZZP",
            legalForm: (company?.legalForm as "EENMANSZAAK" | "VOF" | "BV") ?? "EENMANSZAAK",
            companyName: company?.name ?? "",
            kvkNumber: decrypt(company?.kvkNumber) ?? "",
            vatNumber: decrypt(company?.vatNumber) ?? "",
            address: decrypt(company?.address) ?? "",
            postalCode: company?.postalCode ?? "",
            city: company?.city ?? "",
            country: company?.country ?? "NL",
            locale: (dbUser?.locale as "nl" | "en") ?? "nl",
          }}
        />

        <ModuleToggles
          initialHidden={dbUser?.hiddenModules ?? []}
          isZzp={isZzp}
          canFinance={canFinance}
          canTeam={canTeam}
        />

        {isOwner && <AccountantAccess />}

        {isOwner && <InboundMailCard />}

        {isOwner && <LogoUpload initialLogo={company?.logo ?? null} />}

        {isOwner && (
          <BillingPanel
            plan={plan}
            status={account?.subscription?.status ?? "TRIALING"}
            renews={account?.subscription?.currentPeriodEnd?.toISOString() ?? null}
            trialEndsAt={account?.subscription?.trialEndsAt?.toISOString() ?? null}
            accountType={(company?.accountType as "ZZP" | "BEDRIJF") ?? "ZZP"}
          />
        )}

        <PasswordForm />

        <TwoFactorCard enabled={dbUser?.totpEnabled ?? false} />

        <DangerZone />
        </div>
      </div>
    </div>
  );
}
