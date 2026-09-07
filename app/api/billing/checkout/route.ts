import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { createFirstPayment } from "@/lib/mollie";
import { plansForType } from "@/lib/plans";

const schema = z.object({ plan: z.enum(["GROWTH", "PRO", "BUSINESS", "BUSINESS_PLUS"]) });

// POST /api/billing/checkout — start de eerste betaling en geef checkout-URL terug
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "companySettings");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldig plan" }, { status: 422 });
    }

    // Plan moet bij het accounttype passen (zzp = solo-plannen, bedrijf = team-plannen)
    const company = await db.company.findUnique({ where: { userId: user.accountId }, select: { accountType: true } });
    const accountType = company?.accountType ?? "ZZP";
    if (!plansForType(accountType).includes(parsed.data.plan)) {
      return NextResponse.json({ error: "Dit plan past niet bij je accounttype" }, { status: 422 });
    }

    const { checkoutUrl } = await createFirstPayment(user.accountId, parsed.data.plan);
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    return errorResponse(err);
  }
}
