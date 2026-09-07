import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum");

export const createLeaveSchema = z
  .object({
    type: z.enum(["VACATION", "SICK", "SPECIAL"]).default("VACATION"),
    startDate: dateStr,
    endDate: dateStr,
    hours: z.coerce.number().positive("Uren moeten groter dan 0 zijn").max(1000),
    note: z.string().max(500).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "Einddatum ligt vóór de startdatum",
    path: ["endDate"],
  });

export const decideLeaveSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
});

export const setBalanceSchema = z.object({
  employeeId: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  totalHours: z.coerce.number().min(0).max(3000),
});

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
