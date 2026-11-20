import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { encrypt } from "@/lib/encryption";
import { updateCustomerSchema, withoutUnchangedVatNumber } from "@/lib/validations/invoice";
import { customerVatSchemeProblem, normalizeVatId, parseVatScheme, storedVatScheme } from "@/lib/vat-scheme";
import { normalizePeppolId } from "@/lib/peppol";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { customerDeleteDecision } from "@/lib/quote-retention";
import { logAccount } from "@/lib/audit";

// PATCH /api/customers/:id — klant bewerken
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const current = await db.customer.findFirst({ where: { id, userId: user.accountId }, select: { country: true, vatNumber: true, vatScheme: true } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Een ongewijzigd (oud) btw-nummer blokkeert het bewaren van de rest niet.
    const parsed = updateCustomerSchema.safeParse(withoutUnchangedVatNumber(await req.json(), current.vatNumber));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const d = parsed.data;
    // Standaard btw verlegd of ICL kan alleen met een passend btw-nummer en land.
    // Met de KOR aan geen nieuwe standaard btw verlegd binnen Nederland of ICL.
    // Een klant die die standaard al had, blijft bewerkbaar (facturen vallen dan
    // terug op gewone btw, zie effectiveCustomerVatScheme).
    const vatScheme = d.vatScheme ?? parseVatScheme(current.vatScheme);
    const schemeChanged = vatScheme !== "STANDARD" && vatScheme !== parseVatScheme(current.vatScheme);
    const korEnabled = schemeChanged && !!(await db.invoiceSettings.findUnique({
      where: { userId: user.accountId }, select: { korEnabled: true },
    }))?.korEnabled;
    const schemeProblem = customerVatSchemeProblem({
      vatScheme,
      country: d.country !== undefined ? d.country || "NL" : current.country,
      vatNumber: d.vatNumber !== undefined ? d.vatNumber : current.vatNumber,
    }, { korEnabled });
    if (schemeProblem) return NextResponse.json({ error: schemeProblem }, { status: 422 });

    const result = await db.customer.updateMany({
      where: { id, userId: user.accountId },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.email !== undefined ? { email: d.email || null } : {}),
        ...(d.address !== undefined ? { address: encrypt(d.address) } : {}),
        ...(d.postalCode !== undefined ? { postalCode: d.postalCode || null } : {}),
        ...(d.city !== undefined ? { city: d.city || null } : {}),
        ...(d.country !== undefined ? { country: d.country || "NL" } : {}),
        ...(d.vatNumber !== undefined ? { vatNumber: normalizeVatId(d.vatNumber) || null } : {}),
        ...(d.vatScheme !== undefined ? { vatScheme: storedVatScheme(d.vatScheme) } : {}),
        ...(d.electronicAddress !== undefined ? { electronicAddress: d.electronicAddress.trim() ? normalizePeppolId(d.electronicAddress) : null } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/customers/:id — klant verwijderen.
// Geblokkeerd als er facturen zijn (database: Restrict) of offertes die bewaard
// moeten blijven (verstuurd, ondertekend, omgezet). Concept-offertes en
// periodieke facturen gaan mee weg (database: Cascade), maar pas na een
// bevestiging (?confirm=1) waarin de gebruiker ziet wat er verdwijnt.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const confirmed = new URL(req.url).searchParams.get("confirm") === "1";

    const customer = await db.customer.findFirst({ where: { id, userId: user.accountId }, select: { id: true, name: true } });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let blocked: NextResponse | null = null;
    try {
      // Tellen en verwijderen in één transactie: er kan tussendoor geen offerte
      // verstuurd worden die dan ongemerkt mee zou verdwijnen.
      blocked = await serializableTransaction(async (tx) => {
        const accountId = user.accountId;
        if (await tx.invoice.count({ where: { userId: accountId, customerId: id } })) {
          return NextResponse.json({ error: "HAS_INVOICES" }, { status: 409 });
        }
        const draftWhere = { userId: accountId, customerId: id, status: "DRAFT" as const, signatureName: null, acceptedAt: null, depositInvoiceId: null, convertedInvoiceId: null };
        const allQuotes = await tx.quote.count({ where: { userId: accountId, customerId: id } });
        const draftQuotes = await tx.quote.count({ where: draftWhere });
        const schedules = await tx.recurringInvoice.count({ where: { userId: accountId, customerId: id } });
        const activeSchedules = await tx.recurringInvoice.count({ where: { userId: accountId, customerId: id, active: true } });
        const decision = customerDeleteDecision({ keptQuotes: allQuotes - draftQuotes, draftQuotes, schedules, activeSchedules }, confirmed);
        if (!decision.ok) return NextResponse.json(decision, { status: decision.status });
        const deleted = await tx.customer.deleteMany({ where: { id, userId: accountId } });
        if (deleted.count !== 1) throw new HttpError(404, "Klant niet gevonden.");
        return null;
      });
    } catch (e) {
      // Foreign key restrict: klant heeft nog facturen (bewaarplicht)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return NextResponse.json({ error: "HAS_INVOICES" }, { status: 409 });
      }
      throw e;
    }
    if (blocked) return blocked;
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "customer.deleted", customer.name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
