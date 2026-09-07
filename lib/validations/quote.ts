import { z } from "zod";
import { boundedDate } from "@/lib/validations/shared";
import { lineItemSchema } from "@/lib/validations/invoice";

// Offerte aanmaken — spiegelt de factuur, met `validUntil` i.p.v. dueDate.
export const createQuoteSchema = z.object({
  customerId: z.string().min(1, "Klant is verplicht"),
  issueDate: boundedDate.optional(),
  validUntil: boundedDate.optional(),
  notes: z.string().max(2000).optional(),
  lineItems: z.array(lineItemSchema).min(1, "Minimaal één offerteregel").max(200),
  // Aanbetaling bij digitaal akkoord (0 = geen)
  depositPercent: z.number().int().min(0).max(100).optional(),
});

// "3-Klikken Offerte" — supersnelle offerte. Klantnaam vrij invoerbaar,
// 1 of meer regels (vast 21% btw). Personaliseerbaar per regel.
export const quickQuoteSchema = z.object({
  customerName: z.string().min(1, "Naam klant is verplicht").max(200),
  // Btw-tarief voor alle regels (21 standaard, 9 verlaagd, 0 bij KOR/vrijgesteld)
  vatRate: z.union([z.literal(0), z.literal(9), z.literal(21)]).optional(),
  // Geldigheid in dagen (standaard 14) — daarna verloopt de offerte automatisch
  validityDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
  // Optioneel bericht aan de klant, zichtbaar op de publieke pagina
  notes: z.string().max(1000).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1, "Omschrijving is verplicht").max(500),
        quantity: z.number().positive("Aantal moet groter dan 0 zijn").max(1_000_000),
        unitPrice: z.number().nonnegative("Prijs mag niet negatief zijn").max(1_000_000),
      }),
    )
    .min(1, "Minimaal één regel")
    .max(200),
});

// Klant-aanvullingen op de publieke pagina: eigen regels/wensen + een bericht.
export const clientEditQuoteSchema = z.object({
  note: z.string().max(1000).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.number().positive().max(1_000_000),
        unitPrice: z.number().nonnegative().max(1_000_000),
      }),
    )
    .max(20)
    .optional(),
});

// Status van een bestaande offerte wijzigen (intern, door de eigenaar).
export const updateQuoteStatusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CONVERTED"]),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
