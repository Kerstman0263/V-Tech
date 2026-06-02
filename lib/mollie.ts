import createMollieClient, { type MollieClient } from "@mollie/api-client";

/**
 * Mollie client (singleton). Gebruikt voor maandelijks terugkerende
 * iDEAL/creditcard-incasso's van abonnementen.
 *
 * Flow op hoofdlijnen:
 *  1. Maak een Mollie "customer" aan bij registratie -> sla mollieCustomerId op.
 *  2. Eerste betaling met `sequenceType: "first"` om een mandaat te krijgen.
 *  3. Maak daarna een `subscription` aan voor de maandelijkse incasso.
 *  4. Mollie roept /api/webhooks/mollie aan bij elke statuswijziging.
 */

let client: MollieClient | undefined;

export function mollie(): MollieClient {
  if (!client) {
    const apiKey = process.env.MOLLIE_API_KEY;
    if (!apiKey) {
      throw new Error("MOLLIE_API_KEY ontbreekt. Zie .env.example.");
    }
    client = createMollieClient({ apiKey });
  }
  return client;
}
