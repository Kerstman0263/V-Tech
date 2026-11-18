import { z } from "zod";
import { boundedDate } from "@/lib/validations/shared";
import { MAX_HOURS } from "@/lib/validations/time";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Titel is verplicht").max(200),
  description: z.string().max(2000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  dueDate: boundedDate.optional().nullable(),
  projectId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  hours: z.number().nonnegative().max(MAX_HOURS, "Maximaal 9.999,99 uur").optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  dueDate: boundedDate.optional().nullable(),
  projectId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  // Uren die bij het afronden als registratie klaargezet worden
  hours: z.number().nonnegative().max(MAX_HOURS, "Maximaal 9.999,99 uur").optional(),
  logHours: z.boolean().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
