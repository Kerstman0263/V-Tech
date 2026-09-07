import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { sendInvoiceEmail } from "@/lib/invoice-send";
import { logAccount } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const body = await req.json();
    if (body?.confirmed !== true) return NextResponse.json({ error: "Controleer de factuur en bevestig het versturen." }, { status: 422 });
    const { id } = await params;
    const result = await sendInvoiceEmail(id, user.accountId);
    if (result !== "sent") {
      const status = result === "not_found" ? 404 : result === "email_not_configured" ? 503 : result === "already_closed" ? 409 : 400;
      return NextResponse.json({ error: result }, { status });
    }
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "invoice.emailed", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
