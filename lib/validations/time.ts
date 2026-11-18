import { z } from "zod";
import { boundedDate } from "@/lib/validations/shared";

/** Past in de database (Decimal(6,2)). */
export const MAX_HOURS = 9999.99;
/** Ruime maar redelijke bovengrens voor een uurtarief (excl. btw). */
export const MAX_HOURLY_RATE = 10_000;

export const createTimeEntrySchema = z.object({
  projectId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  date: boundedDate.optional(),
  hours: z.number().positive("Aantal uren moet groter dan 0 zijn").max(MAX_HOURS, "Maximaal 9.999,99 uur"),
  hourlyRate: z.number().nonnegative().max(MAX_HOURLY_RATE, "Uurtarief is te hoog (maximaal € 10.000)").optional(),
  description: z.string().min(1, "Omschrijving is verplicht"),
});

export const updateTimeEntrySchema = z.object({
  status: z.enum(["OPEN", "BILLED"]).optional(),
  date: boundedDate.optional(),
  projectId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  hours: z.number().positive().max(MAX_HOURS, "Maximaal 9.999,99 uur").optional(),
  description: z.string().min(1).optional(),
  hourlyRate: z.number().nonnegative().max(MAX_HOURLY_RATE, "Uurtarief is te hoog (maximaal € 10.000)").optional(),
});

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
