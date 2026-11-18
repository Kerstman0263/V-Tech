import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validations/account";
import { sendAccountCreatedEmails } from "@/lib/account-emails";
import { sendVerificationEmail } from "@/lib/auth-emails";
import { emailConfigured } from "@/lib/email";
import { logPlatform } from "@/lib/audit";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

// Documentversies — verhoog deze bij wijziging van de juridische teksten,
// zodat de Consent-audittrail laat zien welke versie iemand accepteerde.
// Versies van de juridische teksten (lib/legal/content.ts). Ophogen bij elke inhoudelijke wijziging.
const DOC_VERSIONS = { TERMS: "v2.1", PRIVACY: "v2.1", DPA: "v2.0" } as const;

// POST /api/register — nieuw account incl. AVG-consent (audit trail)
export async function POST(req: Request) {
  // Max 5 registraties per uur per IP (anti-spam, beschermt ons mail-domein).
  // Staat bewust vóór de controle op een bestaand adres: de melding
  // 'E-mail al in gebruik' is nodig voor de gebruiker, maar zo kan niemand
  // er in grote aantallen mee aflezen welke adressen een account hebben.
  const limited = rateLimitResponse(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { email, password, companyName, accountType } = parsed.data;
  // Rechtsvorm: zzp is per definitie een eenmanszaak; bedrijven kiezen zelf.
  const legalForm = accountType === "BEDRIJF" ? (parsed.data.legalForm ?? "EENMANSZAAK") : "EENMANSZAAK";
  // Bedrijven starten in een proefperiode van 30 dagen op Business; zzp gratis.
  const subscription =
    accountType === "BEDRIJF"
      ? { plan: "BUSINESS" as const, status: "TRIALING" as const, trialEndsAt: new Date(Date.now() + 30 * 86_400_000) }
      : { plan: "FREE" as const, status: "TRIALING" as const };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "E-mail al in gebruik" }, { status: 409 });
  }

  // IP vastleggen als bewijslast voor de toestemming
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      // Elke nieuwe account-eigenaar krijgt meteen een bedrijfsprofiel
      company: { create: { name: companyName || null, accountType, legalForm } },
      subscription: { create: subscription },
      // Verplichte AVG-acceptaties als audit-records
      consents: {
        create: [
          { type: "TERMS", version: DOC_VERSIONS.TERMS, ipAddress: ip },
          { type: "PRIVACY", version: DOC_VERSIONS.PRIVACY, ipAddress: ip },
          { type: "DPA", version: DOC_VERSIONS.DPA, ipAddress: ip },
        ],
      },
    },
    select: { id: true, email: true, locale: true },
  });

  logPlatform({ id: user.id, email: user.email }, "account.registered", `${email} (${accountType})`);

  // Welkomstmail + eigenaar-notificatie (blokkeert de registratie nooit)
  // + bevestigingslink voor het e-mailadres. Inloggen werkt meteen; het
  // dashboard herinnert aan bevestigen zolang dat nog niet is gebeurd.
  await Promise.allSettled([
    sendAccountCreatedEmails({ email, companyName, source: "registratie" }),
    emailConfigured() ? sendVerificationEmail(user) : Promise.resolve(),
  ]);

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
