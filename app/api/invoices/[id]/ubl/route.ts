import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { can } from "@/lib/permissions";
import { verifyInvoiceAccessToken } from "@/lib/invoice-access";
import { extractIban } from "@/lib/iban";
import { generateUblInvoice } from "@/lib/ubl";

// GET /api/invoices/:id/ubl — e-factuur (UBL 2.1 / Peppol BIS 3) als XML.
// Zelfde toegang als de PDF: ondernemer met financiële rechten, of de klant
// via de beperkte, ondertekende factuurlink.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  let accountId: string;
  if (token !== null) {
    const access = verifyInvoiceAccessToken(token, id);
    if (!access) return new Response("Deze factuurlink is ongeldig of verlopen. Vraag de afzender om een nieuwe link.", { status: 403, headers: privateHeaders });
    accountId = access.accountId;
  } else {
    const session = await auth();
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
    if (!can(session.user, "financials")) return new Response("Forbidden", { status: 403 });
    accountId = session.user.accountId;
  }

  const invoice = await db.invoice.findFirst({
    where: { id, userId: accountId },
    include: {
      customer: true,
      lineItems: { orderBy: { position: "asc" } },
      user: { select: { email: true, company: true } },
    },
  });
  if (!invoice) return new Response("Not found", { status: 404, headers: privateHeaders });
  // Een concept is nog geen factuur: geen e-factuur die al ingeboekt kan worden.
  if (invoice.status === "DRAFT") return new Response("Verstuur de factuur eerst; een concept kan nog wijzigen.", { status: 409, headers: privateHeaders });

  const settings = await db.invoiceSettings.findUnique({ where: { userId: accountId } });
  const company = invoice.user.company;

  const xml = generateUblInvoice({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    supplier: {
      name: company?.name ?? invoice.user.email,
      address: decrypt(company?.address),
      postalCode: company?.postalCode,
      city: company?.city,
      country: company?.country,
      vatNumber: decrypt(company?.vatNumber),
      kvkNumber: decrypt(company?.kvkNumber),
      email: invoice.user.email,
    },
    customer: {
      name: invoice.customer.name,
      address: decrypt(invoice.customer.address),
      postalCode: invoice.customer.postalCode,
      city: invoice.customer.city,
      country: invoice.customer.country,
      vatNumber: invoice.customer.vatNumber,
      email: invoice.customer.email,
    },
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      vatRate: Number(li.vatRate),
      lineTotal: Number(li.lineTotal),
    })),
    subtotal: Number(invoice.subtotal),
    vatAmount: Number(invoice.vatAmount),
    total: Number(invoice.total),
    notes: invoice.notes,
    iban: extractIban(settings?.paymentTerms),
    kor: settings?.korEnabled ?? false,
  });

  return new Response(xml, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="e-factuur-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}.xml"`,
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
