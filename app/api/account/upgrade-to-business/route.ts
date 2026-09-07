import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { ensureAccountSubscription } from "@/lib/subscription";
import { logAccount, logPlatform } from "@/lib/audit";

const schema = z.object({ legalForm: z.enum(["EENMANSZAAK", "VOF", "BV"]).default("EENMANSZAAK") });

/**
 * POST /api/account/upgrade-to-business — zzp'er stapt zélf over naar het
 * bedrijfspaneel (Business). Geen support nodig: paneel wisselt direct,
 * abonnement gaat naar Business met 30 dagen proef (via ensureAccountSubscription).
 * Terug naar zzp blijft een beheerdersactie (dat raakt teamleden en het plan).
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.id !== user.accountId) throw new HttpError(403, "Alleen de account-eigenaar kan overstappen.");
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige rechtsvorm" }, { status: 422 });

    const company = await db.company.findUnique({ where: { userId: user.id }, select: { accountType: true } });
    if (company?.accountType === "BEDRIJF") return NextResponse.json({ ok: true, alreadyBusiness: true });

    await db.company.upsert({
      where: { userId: user.id },
      update: { accountType: "BEDRIJF", legalForm: parsed.data.legalForm },
      create: { userId: user.id, accountType: "BEDRIJF", legalForm: parsed.data.legalForm },
    });
    const sub = await ensureAccountSubscription(user.id, "BEDRIJF");

    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "account.type_changed", "zzp -> bedrijf (zelf overgestapt)");
    logPlatform({ id: user.id, email: user.email }, "account.type_changed", `${user.email}: zzp -> bedrijf (zelf)`);
    return NextResponse.json({ ok: true, plan: sub.plan, status: sub.status, trialEndsAt: sub.trialEndsAt });
  } catch (err) {
    return errorResponse(err);
  }
}
