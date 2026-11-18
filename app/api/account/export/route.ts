import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { decrypt } from "@/lib/encryption";

// GET /api/account/export — download alle accountdata als JSON (AVG-dataportabiliteit)
// Bewust GEEN abonnementscontrole: ook na een verlopen proef (accessState
// 'expired') of opzegging moet de eigenaar zijn eigen gegevens kunnen ophalen.
// Deze route leest alleen; er verandert niets aan het account.
export async function GET() {
  try {
    const user = await requireUser();
    // Alleen de account-eigenaar (+ platformbeheerder) mag de volledige
    // bedrijfsadministratie exporteren — niet een medewerker.
    assertCan(user, "companySettings");
    const acc = user.accountId;

    const [profile, company, customers, invoices, projects, time, mileage, webshopConnections, webshopOrders] = await Promise.all([
      db.user.findUnique({ where: { id: acc } }),
      db.company.findUnique({ where: { userId: acc } }),
      db.customer.findMany({ where: { userId: acc } }),
      db.invoice.findMany({ where: { userId: acc }, include: { lineItems: true } }),
      db.project.findMany({ where: { userId: acc } }),
      db.timeEntry.findMany({ where: { userId: acc } }),
      db.mileageEntry.findMany({ where: { userId: acc } }),
      // Sleutels (credentials) gaan bewust NIET mee in de export.
      db.webshopConnection.findMany({ where: { userId: acc }, select: { id: true, platform: true, name: true, shopUrl: true, status: true, lastSyncAt: true, createdAt: true } }),
      db.webshopOrder.findMany({ where: { userId: acc }, orderBy: { orderDate: "asc" } }),
    ]);

    const data = {
      exportedFor: profile?.email,
      profile: profile
        ? {
            email: profile.email,
            name: profile.name,
            companyName: company?.name ?? null,
            kvkNumber: decrypt(company?.kvkNumber),
            vatNumber: decrypt(company?.vatNumber),
            address: decrypt(company?.address),
            postalCode: company?.postalCode ?? null,
            city: company?.city ?? null,
            country: company?.country ?? null,
          }
        : null,
      customers: customers.map((c) => ({ ...c, address: decrypt(c.address) })),
      invoices,
      projects,
      timeEntries: time,
      mileage,
      webshopConnections,
      webshopOrders,
    };

    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="saldova-export.json"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
