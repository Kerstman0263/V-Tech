import { z } from "zod";

// Datum met realistische grenzen — voorkomt dat een typefout (jaar 20028)
// als serverfout eindigt; de gebruiker krijgt gewoon een validatiemelding.
export const boundedDate = z.coerce
  .date()
  .min(new Date("1900-01-01"), "Ongeldige datum")
  .max(new Date("2200-12-31"), "Ongeldige datum (controleer het jaartal)");
