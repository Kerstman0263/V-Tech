import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1, "Naam is verplicht"),
  customerId: z.string().optional().nullable(),
  description: z.string().max(2000).optional(),
  hourlyRate: z.number().nonnegative().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  customerId: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  hourlyRate: z.number().nonnegative().optional().nullable(),
  archived: z.boolean().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
