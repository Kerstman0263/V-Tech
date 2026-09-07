import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { encrypt, decrypt } from "@/lib/encryption";
import { updateProfileSchema } from "@/lib/validations/account";
import { logPlatform } from "@/lib/audit";

// GET /api/account — eigen profiel + bedrijfsprofiel van het account (gedecrypt)
export async function GET() {
  try {
    const user = await requireUser();
    const [u, company] = await Promise.all([
      db.user.findUnique({
        where: { id: user.id },
        select: { email: true, name: true, locale: true },
      }),
      // Bedrijfsgegevens horen bij het account (de eigenaar), niet bij het lid
      db.company.findUnique({ where: { userId: user.accountId } }),
    ]);
    if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      email: u.email,
      name: u.name,
      locale: u.locale,
      accountType: company?.accountType ?? "ZZP",
      logo: company?.logo ?? null,
      companyName: company?.name ?? null,
      kvkNumber: decrypt(company?.kvkNumber),
      vatNumber: decrypt(company?.vatNumber),
      address: decrypt(company?.address),
      postalCode: company?.postalCode ?? null,
      city: company?.city ?? null,
      country: company?.country ?? "NL",
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/account — bedrijfsgegevens / taal bijwerken
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const parsed = updateProfileSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const d = parsed.data;

    // Het profielformulier stuurt accountType altijd mee; alleen een ECHTE wissel
    // telt als beheerdersactie. Ongewijzigd = negeren.
    if (d.accountType !== undefined) {
      const current = await db.company.findUnique({ where: { userId: user.accountId }, select: { accountType: true } });
      if ((current?.accountType ?? "ZZP") === d.accountType) delete d.accountType;
    }

    // Autorisatie EERST — anders is de naam al gewijzigd als we hieronder 403 geven.
    if (d.accountType !== undefined && user.role !== "ADMIN" && user.role !== "OWNER") {
      return NextResponse.json({ error: "Alleen een beheerder kan het accounttype wijzigen." }, { status: 403 });
    }

    // Persoonlijke velden (naam + taal) op de eigen User
    if (d.name !== undefined || d.locale !== undefined) {
      await db.user.update({
        where: { id: user.id },
        data: {
          ...(d.name !== undefined ? { name: d.name || null } : {}),
          ...(d.locale !== undefined ? { locale: d.locale } : {}),
        },
      });
    }

    // Bedrijfsgegevens horen bij het account — alleen de eigenaar mag ze wijzigen
    const isOwner = user.id === user.accountId;
    const companyFields =
      d.companyName !== undefined ||
      d.kvkNumber !== undefined ||
      d.vatNumber !== undefined ||
      d.address !== undefined ||
      d.postalCode !== undefined ||
      d.city !== undefined ||
      d.country !== undefined ||
      d.accountType !== undefined ||
      d.legalForm !== undefined ||
      d.logo !== undefined;

    // Wisselen tussen zzp en bedrijf is een beheerdersactie (voorkomt dat
    // gebruikers zelf tussen productlijnen en prijsmodellen springen).
    if (d.accountType !== undefined) {
      logPlatform({ id: user.id, email: user.email }, "account.type_changed", `account ${user.accountId} -> ${d.accountType}`);
    }

    if (isOwner && companyFields) {
      const data = {
        // undefined => veld niet aanraken; lege string => leegmaken
        ...(d.accountType !== undefined ? { accountType: d.accountType } : {}),
        ...(d.legalForm !== undefined ? { legalForm: d.legalForm } : {}),
        ...(d.logo !== undefined ? { logo: d.logo || null } : {}),
        ...(d.companyName !== undefined ? { name: d.companyName || null } : {}),
        ...(d.kvkNumber !== undefined ? { kvkNumber: encrypt(d.kvkNumber) } : {}),
        ...(d.vatNumber !== undefined ? { vatNumber: encrypt(d.vatNumber) } : {}),
        ...(d.address !== undefined ? { address: encrypt(d.address) } : {}),
        ...(d.postalCode !== undefined ? { postalCode: d.postalCode || null } : {}),
        ...(d.city !== undefined ? { city: d.city || null } : {}),
        ...(d.country !== undefined ? { country: d.country || "NL" } : {}),
      };
      // Eigenaren hebben altijd een Company (registratie/seed maken die aan),
      // maar upsert vangt oudere accounts veilig op.
      await db.company.upsert({
        where: { userId: user.accountId },
        update: data,
        create: { userId: user.accountId, ...data },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/account — eigen account + alle gekoppelde data verwijderen (AVG)
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    // Wachtwoordbevestiging: een gestolen of geleende sessie mag nooit in één
    // call de complete administratie kunnen wissen.
    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";
    const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!dbUser) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!password || !(await bcrypt.compare(password, dbUser.passwordHash))) {
      return NextResponse.json({ error: "wrong_password" }, { status: 400 });
    }
    // Cascade in het schema verwijdert subscription, klanten, facturen,
    // projecten, uren, ritten, consents en (voor een eigenaar) teamleden.
    await db.user.delete({ where: { id: user.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
