import { z } from "zod";

// Zod-schema's voor input-validatie op de API-routes.
// Eén bron van waarheid: hergebruik in zowel frontend als backend.

export const lineItemSchema = z.object({
  description: z.string().min(1, "Omschrijving is verplicht"),
  quantity: z.number().positive("Aantal moet groter dan 0 zijn"),
  unitPrice: z.number().nonnegative("Stukprijs mag niet negatief zijn"),
  vatRate: z.number().min(0).max(100),
});

export const createInvoiceSchema = z.object({
  customerId: z.string().min(1, "Klant is verplicht"),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  lineItems: z.array(lineItemSchema).min(1, "Minimaal één factuurregel"),
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

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type LineItemInput = z.infer<typeof lineItemSchema>;
