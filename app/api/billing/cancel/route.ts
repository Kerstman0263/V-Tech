import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { cancelRecurringSubscription } from "@/lib/mollie";

// POST /api/billing/cancel — zegt het abonnement op (per einde periode)
export async function POST() {
  try {
    const user = await requireUser();
    assertCan(user, "companySettings");
    await cancelRecurringSubscription(user.accountId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
