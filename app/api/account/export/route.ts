import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { decrypt } from "@/lib/encryption";

// GET /api/account/export — download alle accountdata als JSON (AVG-dataportabiliteit)
export async function GET() {
  try {
    const user = await requireUser();
    // Alleen de account-eigenaar (+ platformbeheerder) mag de volledige
    // bedrijfsadministratie exporteren — niet een medewerker.
    assertCan(user, "companySettings");
    const acc = user.accountId;

    const [profile, company, customers, invoices, projects, time, mileage] = await Promise.all([
      db.user.findUnique({ where: { id: acc } }),
      db.company.findUnique({ where: { userId: acc } }),
      db.customer.findMany({ where: { userId: acc } }),
      db.invoice.findMany({ where: { userId: acc }, include: { lineItems: true } }),
      db.project.findMany({ where: { userId: acc } }),
      db.timeEntry.findMany({ where: { userId: acc } }),
      db.mileageEntry.findMany({ where: { userId: acc } }),
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
