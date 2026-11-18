import { db } from "@/lib/db";
import { formatInvoiceNumber } from "@/lib/invoice-status";

/**
 * Haalt de factuurinstellingen van een gebruiker op, of maakt standaard
 * instellingen aan als die er nog niet zijn (idempotent).
 */
export async function getOrCreateInvoiceSettings(userId: string) {
  return db.invoiceSettings.upsert({ where: { userId }, create: { userId }, update: {} });
}

/**
 * Formatteert het volgende factuurnummer op basis van de instellingen,
 * bijv. prefix "2026-" + padding 4 + nummer 7 -> "2026-0007".
 * (De pure functie staat in lib/invoice-status zodat die zonder database testbaar is.)
 */
export { formatInvoiceNumber };
