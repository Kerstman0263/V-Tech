import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan, can } from "@/lib/permissions";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { updateInvoiceSettingsSchema } from "@/lib/validations/invoice-settings";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { changedOwnerOnlySettings, numberingChange, numberingLabel, paymentTermsChangeLabel } from "@/lib/invoice-settings-change";
import { sendPaymentDetailsChangedEmail } from "@/lib/invoice-settings-emails";

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

// PATCH /api/invoice-settings — standaarden bijwerken.
// - Betaalgegevens (IBAN, tenaamstelling), KOR, huisstijlkleur en voettekst:
//   alleen de eigenaar. Een wijziging van de betaalgegevens komt in Activiteit
//   (IBAN afgeschermd) en de eigenaar krijgt een e-mail.
// - Nummering: in één transactie met rij-lock, binnen een reeks alleen een
//   klein stukje omhoog (lib/invoice-settings-change.ts), en altijd gelogd.
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
    await getOrCreateInvoiceSettings(user.accountId); // zorg dat de rij bestaat
    const isOwner = can(user, "companySettings");
    const actorName = user.name ?? user.email ?? "Accountgebruiker";

    const outcome = await serializableTransaction(async (tx) => {
      // Rij-lock op de instellingen van dit account tot de commit: er kan
      // tussendoor geen factuurnummer uitgegeven worden.
      await tx.invoiceSettings.updateMany({ where: { userId: user.accountId }, data: { nextNumber: { increment: 0 } } });
      const current = await tx.invoiceSettings.findUniqueOrThrow({ where: { userId: user.accountId } });

      const ownerOnly = changedOwnerOnlySettings(parsed.data, current);
      if (ownerOnly.length > 0 && !isOwner) {
        throw new HttpError(403, "Alleen de eigenaar van het account kan de betaalgegevens, de KOR en de huisstijl van facturen wijzigen.");
      }

      const { invoicePrefix, nextNumber, numberPadding, ...rest } = parsed.data;
      const prefixChanged = invoicePrefix !== undefined && invoicePrefix !== current.invoicePrefix;
      const [invoiceCount, prefixCount] = await Promise.all([
        tx.invoice.count({ where: { userId: user.accountId } }),
        prefixChanged ? tx.invoice.count({ where: { userId: user.accountId, invoiceNumber: { startsWith: invoicePrefix } } }) : Promise.resolve(0),
      ]);
      const numbering = numberingChange({
        current, next: { invoicePrefix, nextNumber, numberPadding },
        hasInvoices: invoiceCount > 0, prefixInUse: prefixCount > 0,
      });
      if (numbering.problem) throw new HttpError(400, numbering.problem);

      const updated = await tx.invoiceSettings.update({
        where: { userId: user.accountId },
        data: { ...rest, ...(numbering.changed ? numbering.result : {}) },
      });

      const log = (action: string, target: string) => tx.auditLog.create({ data: {
        platform: false, accountId: user.accountId, actorId: user.id, actorName, action, target,
      } });
      if (numbering.changed) await log("invoice_settings.numbering_changed", `${numberingLabel(current)} → ${numberingLabel(numbering.result)}`);
      const paymentChanged = ownerOnly.includes("paymentTerms");
      if (paymentChanged) await log("invoice_settings.payment_changed", paymentTermsChangeLabel(current.paymentTerms, updated.paymentTerms));
      if (ownerOnly.includes("korEnabled")) await log("invoice_settings.kor_changed", updated.korEnabled ? "aan" : "uit");
      return { updated, paymentChanged, before: current.paymentTerms };
    });

    // Na de commit: de eigenaar krijgt een e-mail bij elke wijziging van de
    // betaalgegevens (ook als hij het zelf deed: zo valt een overgenomen account op).
    // Via after(): het platform laat de functie doorlopen tot de mail weg is,
    // ook als het antwoord al verstuurd is (serverless stopt anders na de response).
    if (outcome.paymentChanged) {
      const mail = { accountId: user.accountId, actorName, before: outcome.before, after: outcome.updated.paymentTerms };
      after(() => sendPaymentDetailsChangedEmail(mail)
        .catch((e) => console.error("[invoice-settings] e-mail betaalgegevens mislukt:", e instanceof Error ? e.message : String(e))));
    }
    return NextResponse.json(outcome.updated);
  } catch (err) {
    return errorResponse(err);
  }
}
