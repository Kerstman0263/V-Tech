import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { generateInvoicePdf } from "@/lib/pdf";

// GET /api/invoices/:id/pdf — download de factuur als PDF
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id, userId: session.user.id },
    include: {
      customer: true,
      lineItems: { orderBy: { position: "asc" } },
      user: true,
    },
  });
  if (!invoice) return new Response("Not found", { status: 404 });

  const pdf = await generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    company: {
      name: invoice.user.companyName ?? invoice.user.email,
      address: decrypt(invoice.user.address),
      postalCode: invoice.user.postalCode,
      city: invoice.user.city,
      vatNumber: decrypt(invoice.user.vatNumber),
      kvkNumber: decrypt(invoice.user.kvkNumber),
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
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="factuur-${invoice.invoiceNumber}.pdf"`,
    },
  });
}
