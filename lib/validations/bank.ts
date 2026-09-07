import { z } from "zod";

export const importBankSchema = z.object({
  transactions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().positive(),
        direction: z.enum(["CREDIT", "DEBIT"]),
        description: z.string().min(1).max(300),
      }),
    )
    .min(1)
    .max(2000),
});

export const bankActionSchema = z.object({
  action: z.enum(["confirm", "ignore", "unmatch"]),
  invoiceId: z.string().optional(),
});
