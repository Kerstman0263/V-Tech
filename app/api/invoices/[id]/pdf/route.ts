import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateInvoicePdf } from "@/lib/pdf";
import { pdfTexts, vatSchemeNoticeText } from "@/lib/pdf-labels";
import { invoicePdfContent } from "@/lib/invoice-pdf-content";
import { can } from "@/lib/permissions";
import { verifyInvoiceAccessToken } from "@/lib/invoice-access";
import { epcQrPayload, extractIban } from "@/lib/iban";
import { invoiceParties, liveSource, partiesInclude } from "@/lib/invoice-snapshot";
import { isReverseCharge } from "@/lib/vat-scheme";

// GET /api/invoices/:id/pdf — download de factuur als PDF (in huisstijl)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");
  let accountId: string;
  if (token !== null) {
    const access = verifyInvoiceAccessToken(token, id);
    if (!access) return new Response("Deze factuurlink is ongeldig of verlopen. Vraag de afzender om een nieuwe link.", { status: 403, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    accountId = access.accountId;
  } else {
    const session = await auth();
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
    if (!can(session.user, "financials")) return new Response("Forbidden", { status: 403 });
    accountId = session.user.accountId;
  }

  const invoice = await db.invoice.findFirst({
    where: { id, userId: accountId },
    include: { ...partiesInclude, lineItems: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return new Response("Not found", { status: 404 });

  // Uitgereikte factuur: de gegevens zoals ze bij het uitreiken waren
  // (momentopname). Concept of oude factuur zonder momentopname: de huidige.
  const parties = invoiceParties(invoice, liveSource(invoice));
  const settings = invoice.user.invoiceSettings;
  // Taal van de factuur: vastgezet bij het uitreiken (de tekst van een
  // uitgereikte factuur verandert niet als de eigenaar later van taal wisselt).
  const locale = parties.locale ?? invoice.user.locale;
  const texts = pdfTexts(locale);
  const total = Number(invoice.total);
  const lineItems = invoice.lineItems.map((li) => ({
    description: li.description,
    quantity: Number(li.quantity),
    unitPrice: Number(li.unitPrice),
    vatRate: Number(li.vatRate),
    lineTotal: Number(li.lineTotal),
  }));

  // Scan-en-betaal-QR: alleen als er een geldig IBAN in de betaalinstructies
  // staat en er nog iets te betalen is (niet voor betaalde facturen of credits).
  const iban = extractIban(parties.paymentTerms);
  const companyName = parties.seller.name;
  const paymentQr = iban && total > 0 && invoice.status !== "PAID" && invoice.status !== "CANCELED"
    ? epcQrPayload({ name: companyName, iban, amount: total, currency: invoice.currency, reference: `Factuur ${invoice.invoiceNumber}` })
    : null;

  // Creditfactuur (kop CREDITFACTUUR, vaste verwijzing naar het origineel) en de
  // KOR-zin als vast onderdeel. Alleen uit wat bij de factuur is opgeslagen,
  // nooit uit de huidige instellingen: een uitgereikte factuur verandert niet.
  const { isCredit, creditReference, notices, notes } = await invoicePdfContent(
    {
      auditLog: { findFirst: (args) => db.auditLog.findFirst(args) },
      invoice: { findFirst: (args) => db.invoice.findFirst(args) },
    },
    accountId,
    {
      invoiceNumber: invoice.invoiceNumber,
      total,
      notes: invoice.notes,
      originalInvoiceNumber: invoice.originalInvoiceNumber,
      originalInvoiceDate: invoice.originalInvoiceDate,
    },
  );

  const schemeNotice = vatSchemeNoticeText(parties.vatScheme, locale);

  let pdf: Uint8Array;
  try {
    pdf = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      deliveryDate: invoice.deliveryDate,
      deliveryEndDate: invoice.deliveryEndDate,
      currency: invoice.currency,
      company: {
        name: companyName,
        address: parties.seller.address,
        postalCode: parties.seller.postalCode,
        city: parties.seller.city,
        vatNumber: parties.seller.vatNumber,
        kvkNumber: parties.seller.kvkNumber,
      },
      customer: {
        name: parties.customer.name,
        address: parties.customer.address,
        postalCode: parties.customer.postalCode,
        city: parties.customer.city,
        country: parties.customer.country,
        vatNumber: parties.customer.vatNumber,
      },
      lineItems,
      subtotal: Number(invoice.subtotal),
      vatAmount: Number(invoice.vatAmount),
      total,
      notes,
      isCredit,
      creditReference,
      buyerReference: invoice.buyerReference,
      // Wettelijke vermelding bij btw verlegd of een intracommunautaire levering.
      notices: [...(schemeNotice ? [schemeNotice] : []), ...notices],
      reverseCharge: isReverseCharge(parties.vatScheme),
      logo: invoice.user.company?.logo,
      accentColor: settings?.accentColor,
      paymentTerms: parties.paymentTerms,
      footerText: parties.footerText,
      paymentQr,
      labels: texts.labels,
    });
  } catch (err) {
    console.error("[invoice-pdf] PDF maken mislukt", { invoiceId: invoice.id, error: err instanceof Error ? err.message : String(err) });
    return new Response(texts.renderError, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  }

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(req.url).searchParams.get("preview") === "1" ? "inline" : "attachment"}; filename="${isCredit ? "creditfactuur" : "factuur"}-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
