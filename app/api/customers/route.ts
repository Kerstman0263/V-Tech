import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import { createCustomerSchema } from "@/lib/validations/invoice";
import { can } from "@/lib/permissions";

// GET /api/customers — lijst van klanten van de ingelogde gebruiker
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(session.user, "financials")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const customers = await db.customer.findMany({
    where: { userId: session.user.accountId },
    orderBy: { createdAt: "desc" },
    include: { invoices: { select: { total: true, status: true } } },
  });

  // Adres decrypten + factuuraantal/omzet per klant
  const result = customers.map(({ invoices, ...c }) => ({
    ...c,
    address: decrypt(c.address),
    invoiceCount: invoices.length,
    revenue: invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + Number(i.total), 0),
  }));

  return NextResponse.json(result);
}

// POST /api/customers — nieuwe klant aanmaken
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(session.user, "financials")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const customer = await db.customer.create({
    data: {
      userId: session.user.accountId,
      name: data.name,
      email: data.email || null,
      address: encrypt(data.address), // AVG: versleuteld opslaan
      postalCode: data.postalCode || null,
      city: data.city || null,
      country: data.country,
      vatNumber: data.vatNumber || null,
    },
  });

  return NextResponse.json({ ...customer, address: data.address }, { status: 201 });
}
