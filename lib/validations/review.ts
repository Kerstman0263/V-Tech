import { z } from "zod";

// Publiek ingestuurde review. E-mail is optioneel (alleen voor opvolging).
export const reviewSchema = z.object({
  name: z.string().min(1, "Naam is verplicht").max(120),
  role: z.string().max(160).optional(),
  rating: z.number().int().min(1).max(5),
  body: z.string().min(10, "Review is te kort").max(2000),
  email: z.union([z.string().email("Ongeldig e-mailadres"), z.literal("")]).optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
