import { z } from "zod";
import { boundedDate, vatRateSchema } from "@/lib/validations/shared";
import { VAT_SCHEMES, normalizeVatId, vatIdCountry } from "@/lib/vat-scheme";
import { parsePeppolId } from "@/lib/peppol";

/** Btw-soort van een factuur of de standaard van een klant (lib/vat-scheme.ts). */
export const vatSchemeSchema = z.enum(VAT_SCHEMES);
// Landcode van twee letters (ISO 3166-1), bijv. NL of BE.
const countrySchema = z.string().trim().regex(/^[A-Za-z]{2}$/, "Vul een landcode van twee letters in, bijvoorbeeld NL of BE").transform((c) => c.toUpperCase());

// Zod-schema's voor input-validatie op de API-routes.
// Eén bron van waarheid: hergebruik in zowel frontend als backend.

export const lineItemSchema = z.object({
  description: z.string().min(1, "Omschrijving is verplicht").max(500),
  quantity: z.number().positive("Aantal moet groter dan 0 zijn").max(1_000_000),
  unitPrice: z.number().nonnegative("Stukprijs mag niet negatief zijn").max(1_000_000),
  // Alleen 0, 9 of 21% (geldt ook voor offertes en periodieke facturen).
  vatRate: vatRateSchema,
});

export const createInvoiceSchema = z.object({
  customerId: z.string().min(1, "Klant is verplicht"),
  issueDate: boundedDate.optional(),
  dueDate: boundedDate.optional(),
  // Datum van levering of dienst (art. 35a Wet OB), of begin en einde van een
  // periode. Optioneel: leeg = gelijk aan de factuurdatum.
  deliveryDate: boundedDate.optional(),
  deliveryEndDate: boundedDate.optional(),
  notes: z.string().max(2000).optional(),
  lineItems: z.array(lineItemSchema).min(1, "Minimaal één factuurregel").max(200),
  // Optioneel: openstaande uren die met deze factuur op BILLED gezet worden
  timeEntryIds: z.array(z.string().min(1).max(100)).max(500).optional(),
  // Btw-soort: gewone btw, btw verlegd (binnenland of EU-dienst) of ICL.
  // Leeg = de standaard van de klant (alleen als alle regels op 0% staan).
  vatScheme: vatSchemeSchema.optional(),
  // Referentie of inkoopordernummer van de klant (BuyerReference in de e-factuur).
  buyerReference: z.string().trim().max(100, "De referentie mag hoogstens 100 tekens zijn").optional(),
})
  .refine((d) => !d.deliveryEndDate || !!d.deliveryDate, { message: "Vul ook de begindatum van de periode in", path: ["deliveryDate"] })
  .refine((d) => !d.deliveryDate || !d.deliveryEndDate || d.deliveryEndDate >= d.deliveryDate, { message: "Het einde van de periode ligt voor het begin", path: ["deliveryEndDate"] });

// Status van een bestaande factuur wijzigen
export const updateInvoiceStatusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELED"]),
});

// Btw-nummer: leeg, of met een landcode van twee letters ervoor (BR-CO-09 in
// de e-factuur), bijv. NL123456789B01 of BE0123456789.
export const vatNumberSchema = z.string().max(30)
  .refine((v) => !normalizeVatId(v) || !!vatIdCountry(v), "Het btw-nummer moet met de landcode beginnen, bijvoorbeeld NL123456789B01 of BE0123456789");
// Peppol-adres van de klant: leeg, of "code:nummer" met een bekende code (lib/peppol.ts).
export const electronicAddressSchema = z.string().max(80)
  .refine((v) => !v.trim() || !!parsePeppolId(v), "Schrijf het Peppol-adres als code:nummer, bijvoorbeeld 0106:12345678 (KvK-nummer). Bekende codes: 0106 (KvK), 0190 (OIN), 0088 (GLN), 0208 (Belgisch ondernemingsnummer), 0204 (Leitweg-ID), 9944, 9925 en 9930 (btw-nummer NL, BE en DE).");

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Naam is verplicht"),
  email: z.string().email("Ongeldig e-mailadres").optional().or(z.literal("")),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: countrySchema.or(z.literal("").transform(() => "NL")).default("NL"),
  vatNumber: vatNumberSchema.optional(),
  vatScheme: vatSchemeSchema.optional(),
  electronicAddress: electronicAddressSchema.optional(),
});

/**
 * Bij het bewerken van een klant: een btw-nummer dat niet verandert, niet
 * opnieuw keuren. Het formulier stuurt altijd alle velden mee; een oude of
 * geïmporteerde klant met een btw-nummer zonder landcode blijft zo bewerkbaar
 * (bijv. alleen het adres). Een nieuw of gewijzigd btw-nummer wordt wel gekeurd.
 */
export function withoutUnchangedVatNumber(body: unknown, currentVatNumber: string | null | undefined): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const { vatNumber, ...rest } = body as Record<string, unknown>;
  if (typeof vatNumber === "string" && normalizeVatId(vatNumber) === normalizeVatId(currentVatNumber)) return rest;
  return body;
}

export const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: countrySchema.optional().or(z.literal("")),
  vatNumber: vatNumberSchema.optional(),
  vatScheme: vatSchemeSchema.optional(),
  electronicAddress: electronicAddressSchema.optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type LineItemInput = z.infer<typeof lineItemSchema>;
