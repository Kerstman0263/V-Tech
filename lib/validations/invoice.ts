import { z } from "zod";
import { boundedDate } from "@/lib/validations/shared";

// Zod-schema's voor input-validatie op de API-routes.
// Eén bron van waarheid: hergebruik in zowel frontend als backend.

export const lineItemSchema = z.object({
  description: z.string().min(1, "Omschrijving is verplicht").max(500),
  quantity: z.number().positive("Aantal moet groter dan 0 zijn").max(1_000_000),
  unitPrice: z.number().nonnegative("Stukprijs mag niet negatief zijn").max(1_000_000),
  vatRate: z.number().min(0).max(100),
});

export const createInvoiceSchema = z.object({
  customerId: z.string().min(1, "Klant is verplicht"),
  issueDate: boundedDate.optional(),
  dueDate: boundedDate.optional(),
  notes: z.string().max(2000).optional(),
  lineItems: z.array(lineItemSchema).min(1, "Minimaal één factuurregel").max(200),
  // Optioneel: openstaande uren die met deze factuur op BILLED gezet worden
  timeEntryIds: z.array(z.string().min(1).max(100)).max(500).optional(),
});

// Status van een bestaande factuur wijzigen
export const updateInvoiceStatusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELED"]),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Naam is verplicht"),
  email: z.string().email("Ongeldig e-mailadres").optional().or(z.literal("")),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default("NL"),
  vatNumber: z.string().optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type LineItemInput = z.infer<typeof lineItemSchema>;
