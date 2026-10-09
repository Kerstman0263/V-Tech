import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../lib/demo";

/**
 * Seed:
 *  1. Super-admin uit ADMIN_EMAIL / ADMIN_PASSWORD (.env.local)
 *  2. Demo-account (DEMO_EMAIL / DEMO_PASSWORD) — volwaardig PRO-account
 *     met voorbeelddata zodat de "Probeer de demo"-knop iets te tonen heeft.
 *
 * Draai met:  npm run db:seed   (idempotent — veilig om te herhalen)
 */
const db = new PrismaClient();

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("⚠ ADMIN_EMAIL/ADMIN_PASSWORD niet gezet — admin overgeslagen.");
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await db.user.upsert({
    where: { email },
    update: { role: "OWNER" },
    create: {
      email,
      passwordHash,
      role: "OWNER",
      emailVerifiedAt: new Date(),
      company: { create: { name: "Saldova" } },
      subscription: { create: { plan: "PRO", status: "ACTIVE" } },
    },
  });
  console.log(`✓ Admin klaar: ${admin.email}`);
}

async function seedDemo() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Schone start voor de demo: bestaand demo-account + data weg (cascade)
  await db.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const demo = await db.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      role: "USER",
      emailVerifiedAt: new Date(),
      locale: "nl",
      company: {
        create: {
          name: "Demo Onderneming",
          postalCode: "1011 AB",
          city: "Amsterdam",
          country: "NL",
        },
      },
      subscription: { create: { plan: "PRO", status: "ACTIVE" } },
    },
  });

  // Klant
  const customer = await db.customer.create({
    data: {
      userId: demo.id,
      name: "Acme B.V.",
      email: "info@acme.nl",
      postalCode: "3011 AA",
      city: "Rotterdam",
      country: "NL",
    },
  });

  // Project
  const project = await db.project.create({
    data: {
      userId: demo.id,
      customerId: customer.id,
      name: "Website redesign",
      description: "Nieuwe huisstijl en website voor Acme.",
      hourlyRate: 75,
    },
  });

  // Factuur met regels
  await db.invoice.create({
    data: {
      userId: demo.id,
      customerId: customer.id,
      invoiceNumber: "2026-0001",
      status: "SENT",
      subtotal: 1500,
      vatAmount: 315,
      total: 1815,
      lineItems: {
        create: [
          { description: "Ontwerp homepage", quantity: 10, unitPrice: 75, vatRate: 21, lineTotal: 750, position: 0 },
          { description: "Ontwikkeling", quantity: 10, unitPrice: 75, vatRate: 21, lineTotal: 750, position: 1 },
        ],
      },
    },
  });

  // Urenregistratie
  await db.timeEntry.createMany({
    data: [
      { userId: demo.id, projectId: project.id, customerId: customer.id, hours: 4, hourlyRate: 75, description: "Wireframes", status: "OPEN" },
      { userId: demo.id, projectId: project.id, customerId: customer.id, hours: 6, hourlyRate: 75, description: "Homepage bouwen", status: "OPEN" },
      { userId: demo.id, projectId: project.id, customerId: customer.id, hours: 8, hourlyRate: 75, description: "Eerste sprint", status: "BILLED" },
    ],
  });

  // Rittenregistratie
  await db.mileageEntry.createMany({
    data: [
      { userId: demo.id, projectId: project.id, fromAddress: "Amsterdam", toAddress: "Rotterdam", distanceKm: 78, type: "BUSINESS", ratePerKm: 0.23, description: "Kick-off meeting" },
      { userId: demo.id, projectId: project.id, fromAddress: "Rotterdam", toAddress: "Amsterdam", distanceKm: 78, type: "BUSINESS", ratePerKm: 0.23, description: "Retour kick-off" },
    ],
  });

  console.log(`✓ Demo-account klaar: ${demo.email} / ${DEMO_PASSWORD}`);
}

async function main() {
  await seedAdmin();
  await seedDemo();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
