import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { updateInvoiceSettingsSchema } from "@/lib/validations/invoice-settings";

// GET /api/invoice-settings — huidige standaarden
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const settings = await getOrCreateInvoiceSettings(user.accountId);
    return NextResponse.json(settings);
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/invoice-settings — standaarden bijwerken
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const parsed = updateInvoiceSettingsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const current = await getOrCreateInvoiceSettings(user.accountId); // zorg dat de rij bestaat
    // Factuurnummers moeten doorlopend blijven: terugzetten breekt de reeks en botst op unieke nummers.
    if (parsed.data.nextNumber !== undefined && parsed.data.nextNumber < current.nextNumber) {
      return NextResponse.json({ error: `Het volgende factuurnummer kan alleen omhoog (minimaal ${current.nextNumber}).` }, { status: 400 });
    }
    const updated = await db.invoiceSettings.update({
      where: { userId: user.accountId },
      data: parsed.data,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
