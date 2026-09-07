import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { generateInvoicePdf } from "@/lib/pdf";
import { can } from "@/lib/permissions";
import { verifyInvoiceAccessToken } from "@/lib/invoice-access";

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
    include: {
      customer: true,
      lineItems: { orderBy: { position: "asc" } },
      user: { select: { email: true, company: true } },
    },
  });
  if (!invoice) return new Response("Not found", { status: 404 });

  const settings = await db.invoiceSettings.findUnique({
    where: { userId: accountId },
  });

  const pdf = await generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    company: {
      name: invoice.user.company?.name ?? invoice.user.email,
      address: decrypt(invoice.user.company?.address),
      postalCode: invoice.user.company?.postalCode ?? null,
      city: invoice.user.company?.city ?? null,
      vatNumber: decrypt(invoice.user.company?.vatNumber),
      kvkNumber: decrypt(invoice.user.company?.kvkNumber),
    },
    customer: {
      name: invoice.customer.name,
      address: decrypt(invoice.customer.address),
      postalCode: invoice.customer.postalCode,
      city: invoice.customer.city,
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
    logo: invoice.user.company?.logo,
    accentColor: settings?.accentColor,
    paymentTerms: settings?.paymentTerms,
    footerText: settings?.footerText,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(req.url).searchParams.get("preview") === "1" ? "inline" : "attachment"}; filename="factuur-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
