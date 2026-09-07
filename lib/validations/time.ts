import { z } from "zod";
import { boundedDate } from "@/lib/validations/shared";

export const createTimeEntrySchema = z.object({
  projectId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  date: boundedDate.optional(),
  hours: z.number().positive("Aantal uren moet groter dan 0 zijn"),
  hourlyRate: z.number().nonnegative().optional(),
  description: z.string().min(1, "Omschrijving is verplicht"),
});

export const updateTimeEntrySchema = z.object({
  status: z.enum(["OPEN", "BILLED"]).optional(),
  date: boundedDate.optional(),
  projectId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  hours: z.number().positive().optional(),
  description: z.string().min(1).optional(),
  hourlyRate: z.number().nonnegative().optional(),
});

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
