import { z } from "zod";
import { boundedDate } from "@/lib/validations/shared";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Titel is verplicht").max(200),
  description: z.string().max(2000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  dueDate: boundedDate.optional().nullable(),
  projectId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  hours: z.number().nonnegative().optional(),
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
  hours: z.number().nonnegative().optional(),
  logHours: z.boolean().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
