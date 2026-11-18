import { z } from "zod";
import { MAX_DOCUMENT_DATA_URL_LENGTH } from "@/lib/document-file";

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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum").refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100;
  }, "Ongeldige datum"),
  vendor: z.string().trim().min(1, "Leverancier is verplicht").max(160),
  description: z.string().max(500).optional(),
  category: z.enum(EXPENSE_CATEGORIES).default("OTHER"),
  amountGross: z.coerce.number().positive("Bedrag moet groter dan 0 zijn").max(1_000_000),
  vatRate: z.coerce.number().refine((v) => [0, 9, 21].includes(v), "Kies 0, 9 of 21%"),
  // Bonnetje als base64 data-URL: PNG, JPEG, WebP of PDF tot 2 MB (geen SVG).
  // De server controleert daarna de echte bytes (verifiedDocumentDataUrl).
  receipt: z
    .string()
    .regex(/^data:(image\/png|image\/jpeg|image\/webp|application\/pdf);base64,/, "Alleen een foto (PNG, JPEG, WebP) of pdf")
    .max(MAX_DOCUMENT_DATA_URL_LENGTH, "Het bonnetje is groter dan 2 MB")
    .nullable()
    .optional(),
};

export const createExpenseSchema = z.object(base).extend({ inboxItemId: z.string().min(1).max(100).optional() });
// Bij bewerken stuurt het scherm het bestaande bonnetje terug; dat kan nog een
// ouder formaat zijn. De route controleert alleen een nieuw (gewijzigd) bonnetje.
export const updateExpenseSchema = z
  .object(base)
  .partial()
  .extend({ receipt: z.string().startsWith("data:").max(MAX_DOCUMENT_DATA_URL_LENGTH, "Het bonnetje is groter dan 2 MB").nullable().optional() });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
