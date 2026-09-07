import { z } from "zod";

// Producten-/dienstencatalogus: vaste regels die je op een factuur of
// offerte kiest i.p.v. steeds opnieuw typt.
export const productSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200),
  description: z.string().trim().max(500).optional(),
  unitPrice: z.number().min(0, "Prijs mag niet negatief zijn").max(1_000_000),
  vatRate: z.number().min(0).max(100),
  unit: z.string().trim().max(20).optional(),
  active: z.boolean().optional(),
});

export const updateProductSchema = productSchema.partial();

export type ProductInput = z.infer<typeof productSchema>;
