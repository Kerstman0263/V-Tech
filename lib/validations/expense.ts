import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "OFFICE",
  "TRAVEL",
  "EQUIPMENT",
  "SOFTWARE",
  "PHONE_INTERNET",
  "MARKETING",
  "EDUCATION",
  "INSURANCE",
  "OTHER",
] as const;

const base = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  vendor: z.string().trim().min(1, "Leverancier is verplicht").max(160),
  description: z.string().max(500).optional(),
  category: z.enum(EXPENSE_CATEGORIES).default("OTHER"),
  amountGross: z.coerce.number().positive("Bedrag moet groter dan 0 zijn").max(1_000_000),
  vatRate: z.coerce.number().refine((v) => [0, 9, 21].includes(v), "Kies 0, 9 of 21%"),
  // Bonnetje als base64 data-URL (max ~2 MB zoals het bedrijfslogo)
  receipt: z.string().startsWith("data:image/", "Alleen afbeeldingen").max(2_500_000).nullable().optional(),
};

export const createExpenseSchema = z.object(base);
export const updateExpenseSchema = z.object(base).partial();

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
