import { z } from "zod";

// E-mail altijd getrimd en lowercase opslaan — login is daardoor
// ongevoelig voor hoofdletters (telefoon-autocapitalize).
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Ongeldig e-mailadres");

// Registratie — verplichte AVG-acceptaties (DPA + privacy + voorwaarden)
export const registerSchema = z.object({
  email: emailField,
  password: z.string().min(8, "Minimaal 8 tekens"),
  companyName: z.string().max(200).optional(),
  accountType: z.enum(["ZZP", "BEDRIJF"]).default("ZZP"),
  legalForm: z.enum(["EENMANSZAAK", "VOF", "BV"]).optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Je moet de voorwaarden accepteren" }),
  }),
  acceptPrivacy: z.literal(true, {
    errorMap: () => ({ message: "Je moet de privacyverklaring accepteren" }),
  }),
  acceptDpa: z.literal(true, {
    errorMap: () => ({ message: "Je moet de verwerkersovereenkomst accepteren" }),
  }),
});

// Account: profiel/bedrijfsgegevens bijwerken (alle velden optioneel)
// `name` + `locale` = persoonlijk (eigen User); de rest = bedrijfsprofiel (Company).
export const updateProfileSchema = z.object({
  name: z.string().max(120).optional(),
  companyName: z.string().max(200).optional(),
  accountType: z.enum(["ZZP", "BEDRIJF"]).optional(),
  legalForm: z.enum(["EENMANSZAAK", "VOF", "BV"]).optional(),
  logo: z
    .string()
    .max(2_500_000) // base64 data-URL (max ~2 MB)
    .refine((v) => v === "" || (v.startsWith("data:image/") && !v.startsWith("data:image/svg")), "Alleen PNG/JPG/WebP-afbeeldingen")
    .optional(),
  kvkNumber: z.string().max(50).optional(),
  vatNumber: z.string().max(50).optional(),
  address: z.string().max(300).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(2).optional(),
  locale: z.enum(["nl", "en"]).optional(),
});

// Account: wachtwoord wijzigen
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Huidig wachtwoord is verplicht"),
  newPassword: z.string().min(8, "Minimaal 8 tekens"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Admin: handmatig account aanmaken
export const adminCreateUserSchema = z.object({
  email: emailField,
  password: z.string().min(8),
  companyName: z.string().optional(),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
  plan: z.enum(["FREE", "GROWTH", "PRO", "BUSINESS", "BUSINESS_PLUS"]).default("FREE"),
});

// Admin: plan/rol wijzigen
export const adminUpdateUserSchema = z.object({
  plan: z.enum(["FREE", "GROWTH", "PRO", "BUSINESS", "BUSINESS_PLUS"]).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"]).optional(),
  // Paneel-wissel (zzp <-> bedrijf): uitsluitend een beheerdersactie.
  accountType: z.enum(["ZZP", "BEDRIJF"]).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
