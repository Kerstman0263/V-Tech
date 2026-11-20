import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { sendInvoiceEmail } from "@/lib/invoice-send";
import { missingSenderFields, missingSenderMessage } from "@/lib/invoice-sender";
import { logAccount } from "@/lib/audit";
import { DEMO_EMAIL } from "@/lib/demo";
import { prepareIssue } from "@/lib/invoice-snapshot";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    // Het demo-account mailt nooit echte klanten.
    if (user.email?.toLowerCase() === DEMO_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: "In de demo kun je dit niet wijzigen", code: "demo_locked" }, { status: 403 });
    }
    const body = await req.json();
    if (body?.confirmed !== true) return NextResponse.json({ error: "Controleer de factuur en bevestig het versturen." }, { status: 422 });
    const { id } = await params;

    // Verplichte afzendergegevens: zonder bedrijfsnaam, adres en btw-nummer
    // (btw-nummer niet bij de KOR) is een factuur niet geldig.
    const owner = await db.user.findUnique({
      where: { id: user.accountId },
      select: {
        company: { select: { name: true, address: true, postalCode: true, city: true, vatNumber: true, kvkNumber: true, country: true } },
        invoiceSettings: { select: { korEnabled: true } },
      },
    });
    const missing = missingSenderFields(owner?.company, owner?.invoiceSettings?.korEnabled ?? false);
    const message = missingSenderMessage(missing);
    if (message) return NextResponse.json({ error: message, code: "sender_details_missing", missing }, { status: 409 });

    const result = await sendInvoiceEmail(id, user.accountId);
    if (result === "sender_details_missing") {
      return NextResponse.json({ error: "Vul eerst je bedrijfsgegevens in bij Instellingen > Bedrijfsgegevens. Die moeten wettelijk op een factuur staan.", code: result }, { status: 409 });
    }
    if (result === "invoice_rules_blocked") {
      // Btw-soort of KOR klopt niet (meer) met de huidige gegevens: zeg precies wat.
      const issue = await prepareIssue(db, user.accountId, id);
      return NextResponse.json({ error: issue.problem ?? "Deze factuur kan zo niet worden verstuurd. Controleer de btw op de regels en het btw-nummer van de klant.", code: result }, { status: 422 });
    }
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
