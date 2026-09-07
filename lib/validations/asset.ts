import { z } from "zod";

export const ASSET_CATEGORIES = ["EQUIPMENT", "VEHICLE", "FURNITURE", "SOFTWARE", "BUILDING", "OTHER"] as const;

const base = {
  name: z.string().trim().min(1, "Naam is verplicht").max(160),
  category: z.enum(ASSET_CATEGORIES).default("EQUIPMENT"),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  purchasePrice: z.coerce.number().positive("Aanschafprijs moet groter dan 0 zijn").max(10_000_000),
  residualValue: z.coerce.number().min(0).max(10_000_000).default(0),
  usefulLifeMonths: z.coerce.number().int().min(1).max(600).default(60),
  disposedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(500).optional(),
};

export const createAssetSchema = z.object(base).refine((a) => a.residualValue <= a.purchasePrice, {
  message: "Restwaarde kan niet hoger zijn dan de aanschafprijs",
  path: ["residualValue"],
});
export const updateAssetSchema = z.object(base).partial();
