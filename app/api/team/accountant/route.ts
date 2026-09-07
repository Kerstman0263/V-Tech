import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { isAccountOwner, isPlatformAdmin } from "@/lib/permissions";
import { isPaidPlan } from "@/lib/plans";
import { emailField } from "@/lib/validations/account";
import { sendEmail, emailConfigured } from "@/lib/email";
import { logAccount } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

/**
 * Boekhouder-toegang (adviseur). Eén boekhouder per account, telt niet mee
 * als teamlid/seat, ziet alle financiën maar geen personeel of instellingen.
 * Beschikbaar vanaf een betaald plan (en voor platformbeheerders om te testen).
 *
 * GET    -> { accountant: { email, name, createdAt } | null, allowed }
 * POST   { email, name? } -> maakt account aan, mailt de inloggegevens
 *           (of geeft het tijdelijke wachtwoord terug als mail niet werkt)
 * DELETE -> trekt de toegang in (account verwijderd)
 */
const inviteSchema = z.object({
  email: emailField,
  name: z.string().trim().max(120).optional(),
});

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function ownerContext() {
  const user = await requireUser();
  if (!isAccountOwner(user) && !isPlatformAdmin(user)) {
    throw new HttpError(403, "Alleen de eigenaar kan boekhouder-toegang beheren.");
  }
  const sub = await db.subscription.findUnique({ where: { userId: user.accountId }, select: { plan: true } });
  const allowed = isPaidPlan(sub?.plan ?? "FREE") || isPlatformAdmin(user);
  return { user, allowed };
}

export async function GET() {
  try {
    const { user, allowed } = await ownerContext();
    const accountant = await db.user.findFirst({
      where: { ownerId: user.accountId, teamRole: "ACCOUNTANT" },
      select: { email: true, name: true, createdAt: true },
    });
    return NextResponse.json({ allowed, accountant });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { user, allowed } = await ownerContext();
    if (!allowed) throw new HttpError(402, "Boekhouder-toegang is beschikbaar vanaf een betaald plan.");
    rateLimit(`accountant-invite:${user.accountId}`, 5, 60 * 60 * 1000);

    const parsed = inviteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Ongeldig e-mailadres." }, { status: 422 });
    const { email, name } = parsed.data;

    const existingAccountant = await db.user.findFirst({ where: { ownerId: user.accountId, teamRole: "ACCOUNTANT" }, select: { id: true } });
    if (existingAccountant) throw new HttpError(409, "Er is al een boekhouder gekoppeld. Trek die eerst in.");
    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw new HttpError(409, "Dit e-mailadres heeft al een Saldova-account.");

    // Tijdelijk wachtwoord: 12 tekens, leesbaar; de boekhouder wijzigt het zelf.
    const tempPassword = randomBytes(9).toString("base64url").slice(0, 12);
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const owner = await db.user.findUnique({ where: { id: user.accountId }, select: { email: true, company: { select: { name: true } } } });
    const companyName = owner?.company?.name ?? owner?.email ?? "een Saldova-klant";

    await db.user.create({
      data: { email, passwordHash, name: name || null, role: "USER", ownerId: user.accountId, teamRole: "ACCOUNTANT" },
    });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "team.accountant_added", email);

    let emailed = false;
    if (emailConfigured()) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";
      try {
        await sendEmail({
          to: email,
          replyTo: owner?.email ?? undefined,
          fromName: `${companyName} via Saldova`,
          subject: `Boekhouder-toegang tot de administratie van ${companyName}`,
          html: `
            <h2 style="color:#111827">Je hebt toegang gekregen</h2>
            <p>${esc(companyName)} heeft je toegang gegeven tot de administratie in Saldova: facturen, offertes, uitgaven, bank en btw.</p>
            <p><strong>Inloggen:</strong> <a href="${appUrl}/login">${appUrl}/login</a><br>
            <strong>E-mail:</strong> ${esc(email)}<br>
            <strong>Tijdelijk wachtwoord:</strong> <code>${esc(tempPassword)}</code></p>
            <p style="color:#6b7280;font-size:14px">Wijzig je wachtwoord na de eerste keer inloggen via Instellingen. Daar kun je ook tweestapsverificatie aanzetten.</p>
          `,
        });
        emailed = true;
      } catch {
        emailed = false;
      }
    }

    // Geen mail mogelijk -> eenmalig het wachtwoord teruggeven zodat de eigenaar het zelf doorgeeft
    return NextResponse.json({ ok: true, emailed, tempPassword: emailed ? undefined : tempPassword }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const { user } = await ownerContext();
    const accountant = await db.user.findFirst({ where: { ownerId: user.accountId, teamRole: "ACCOUNTANT" }, select: { id: true, email: true } });
    if (!accountant) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await db.user.delete({ where: { id: accountant.id } });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "team.accountant_removed", accountant.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
