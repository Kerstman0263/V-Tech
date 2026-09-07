import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(1, "Naam is verplicht").max(120),
  email: z.string().email("Ongeldig e-mailadres"),
  subject: z.string().max(160).optional(),
  message: z.string().min(10, "Bericht is te kort").max(5000),
});

export type ContactInput = z.infer<typeof contactSchema>;
