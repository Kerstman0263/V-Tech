import { z } from "zod";

// Datum met realistische grenzen — voorkomt dat een typefout (jaar 20028)
// als serverfout eindigt; de gebruiker krijgt gewoon een validatiemelding.
export const boundedDate = z.coerce
  .date()
  .min(new Date("1900-01-01"), "Ongeldige datum")
  .max(new Date("2200-12-31"), "Ongeldige datum (controleer het jaartal)");

/** Nederlandse btw-tarieven: 0% (vrijgesteld/KOR/verlegd), 9% (laag), 21% (hoog). */
export const VAT_RATES = [0, 9, 21] as const;
export const isAllowedVatRate = (value: number) => (VAT_RATES as readonly number[]).includes(value);
/** Zelfde regel als bij uitgaven (lib/validations/expense.ts). */
export const vatRateSchema = z.number().refine(isAllowedVatRate, "Kies 0, 9 of 21%");
