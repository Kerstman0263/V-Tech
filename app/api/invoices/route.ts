import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";

// GET /api/invoices — facturen van de ingelogde gebruiker
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invoices = await db.invoice.findMany({
    where: { userId: session.user.id },
    include: { customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invoices);
}

// POST /api/invoices — nieuwe factuur aanmaken (incl. regels, in één transactie)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json();
  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const data = parsed.data;

  // Controleer dat de klant van deze gebruiker is (geen IDOR)
  const customer = await db.customer.findFirst({
    where: { id: data.customerId, userId },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const totals = calculateInvoiceTotals(data.lineItems);

  // Genereer een volgend factuurnummer per jaar: "2026-0001"
  const year = (data.issueDate ?? new Date()).getFullYear();
  const count = await db.invoice.count({
    where: { userId, invoiceNumber: { startsWith: `${year}-` } },
  });
  const invoiceNumber = `${year}-${String(count + 1).padStart(4, "0")}`;

  const invoice = await db.invoice.create({
    data: {
      userId,
      customerId: data.customerId,
      invoiceNumber,
      issueDate: data.issueDate ?? new Date(),
      dueDate: data.dueDate ?? null,
      notes: data.notes ?? null,
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      total: totals.total,
      lineItems: {
        create: totals.lineItems.map((li, i) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          vatRate: li.vatRate,
          lineTotal: li.lineTotal,
          position: i,
        })),
      },
    },
    include: { lineItems: true },
  });

  return NextResponse.json(invoice, { status: 201 });
}
