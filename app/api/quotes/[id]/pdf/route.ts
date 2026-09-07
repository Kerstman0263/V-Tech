import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { generateInvoicePdf } from "@/lib/pdf";
import { can } from "@/lib/permissions";

// GET /api/quotes/:id/pdf — download de offerte als PDF (in huisstijl).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!can(session.user, "financials")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;

  const quote = await db.quote.findFirst({
    where: { id, userId: session.user.accountId },
    include: {
      customer: true,
      lineItems: { orderBy: { position: "asc" } },
      user: { include: { company: true } },
    },
  });
  if (!quote) return new Response("Not found", { status: 404 });

  const settings = await db.invoiceSettings.findUnique({ where: { userId: session.user.accountId } });
  const c = quote.user.company;

  const pdf = await generateInvoicePdf({
    invoiceNumber: quote.quoteNumber,
    issueDate: quote.issueDate,
    dueDate: quote.validUntil,
    currency: quote.currency,
    documentLabel: "OFFERTE",
    recipientLabel: "Offerte voor:",
    dueLabel: "Geldig tot:",
    company: {
      name: c?.name ?? quote.user.email,
      address: decrypt(c?.address),
      postalCode: c?.postalCode ?? null,
      city: c?.city ?? null,
      vatNumber: decrypt(c?.vatNumber),
      kvkNumber: decrypt(c?.kvkNumber),
    },
    customer: {
      name: quote.customer.name,
      address: decrypt(quote.customer.address),
      postalCode: quote.customer.postalCode,
      city: quote.customer.city,
    },
    lineItems: quote.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      vatRate: Number(li.vatRate),
      lineTotal: Number(li.lineTotal),
    })),
    subtotal: Number(quote.subtotal),
    vatAmount: Number(quote.vatAmount),
    total: Number(quote.total),
    notes: quote.notes,
    logo: c?.logo,
    accentColor: settings?.accentColor,
    footerText: settings?.footerText,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="offerte-${quote.quoteNumber}.pdf"`,
    },
  });
}
