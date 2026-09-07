import { z } from "zod";
import { boundedDate } from "@/lib/validations/shared";

export const createMileageSchema = z.object({
  projectId: z.string().optional().nullable(),
  date: boundedDate.optional(),
  fromAddress: z.string().min(1, "Vertrekadres is verplicht"),
  toAddress: z.string().min(1, "Bestemming is verplicht"),
  distanceKm: z.number().positive("Afstand moet groter dan 0 zijn"),
  type: z.enum(["BUSINESS", "PRIVATE"]).default("BUSINESS"),
  ratePerKm: z.number().nonnegative().optional(),
  description: z.string().max(500).optional(),
});

export const updateMileageSchema = z.object({
  projectId: z.string().optional().nullable(),
  date: boundedDate.optional(),
  fromAddress: z.string().min(1).optional(),
  toAddress: z.string().min(1).optional(),
  distanceKm: z.number().positive().optional(),
  type: z.enum(["BUSINESS", "PRIVATE"]).optional(),
  ratePerKm: z.number().nonnegative().optional(),
  description: z.string().max(500).optional().nullable(),
});

export type CreateMileageInput = z.infer<typeof createMileageSchema>;
