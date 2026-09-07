import { z } from "zod";
import { emailField } from "@/lib/validations/account";

export const addMemberSchema = z.object({
  name: z.string().min(1, "Naam is verplicht").max(120),
  email: emailField,
  password: z.string().min(8, "Minimaal 8 tekens"),
  teamRole: z.enum(["MEMBER", "MANAGER"]).default("MEMBER"),
});

export const updateMemberRoleSchema = z.object({
  teamRole: z.enum(["MEMBER", "MANAGER"]).optional(),
  // Rechtenmatrix: expliciete set -> permissionsCustom=true; resetPermissions -> terug naar rol-standaard
  permissions: z.array(z.enum(["financials", "approveHours", "manageTeam", "exports"])).max(4).optional(),
  resetPermissions: z.boolean().optional(),
  // Bruto uurloon (kostprijs) — null = onbekend
  hourlyCost: z.number().min(0).max(1000).nullable().optional(),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
