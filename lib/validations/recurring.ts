import { z } from "zod";
import { boundedDate } from "@/lib/validations/shared";
import { lineItemSchema } from "@/lib/validations/invoice";

export const RECURRING_INTERVALS = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;

// Periodieke factuur: een sjabloon dat op nextRunAt een echte factuur wordt.
export const createRecurringSchema = z.object({
  customerId: z.string().min(1, "Klant is verplicht"),
  interval: z.enum(RECURRING_INTERVALS).default("MONTHLY"),
  // Eerste factuurdatum; standaard vandaag
  startDate: boundedDate.optional(),
  autoSend: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  lineItems: z.array(lineItemSchema).min(1, "Minimaal één regel").max(200),
});

export const updateRecurringSchema = z.object({
  interval: z.enum(RECURRING_INTERVALS).optional(),
  nextRunAt: boundedDate.optional(),
  active: z.boolean().optional(),
  autoSend: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1).max(200).optional(),
});

/** Regels zoals ze in de Json-kolom staan — bij het draaien opnieuw gevalideerd. */
export const recurringLineItemsSchema = z.array(lineItemSchema).min(1).max(200);

export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];
