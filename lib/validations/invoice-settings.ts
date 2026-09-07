import { z } from "zod";

// Validatie voor het bijwerken van factuurinstellingen (alles optioneel).
export const updateInvoiceSettingsSchema = z.object({
  invoicePrefix: z.string().max(20).optional(),
  nextNumber: z.number().int().min(1).optional(),
  numberPadding: z.number().int().min(1).max(10).optional(),
  defaultVatRate: z.number().min(0).max(100).optional(),
  korEnabled: z.boolean().optional(),
  defaultDueDays: z.number().int().min(0).max(365).optional(),
  defaultCurrency: z.string().length(3).optional(),
  defaultNotes: z.string().max(2000).optional(),
  footerText: z.string().max(2000).optional(),
  paymentTerms: z.string().max(2000).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Geldige hexkleur vereist (bijv. #2563eb)")
    .optional(),
  // Offerte-nummering
  quotePrefix: z.string().max(20).optional(),
  quoteNextNumber: z.number().int().min(1).optional(),
  quotePadding: z.number().int().min(1).max(10).optional(),
  // Automatische betaalherinneringen
  reminderEnabled: z.boolean().optional(),
  reminderIntervalDays: z.number().int().min(1).max(90).optional(),
  reminderMaxCount: z.number().int().min(0).max(10).optional(),
});

export type UpdateInvoiceSettingsInput = z.infer<typeof updateInvoiceSettingsSchema>;
