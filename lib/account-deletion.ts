/**
 * Account verwijderen: eerst de export, dan pas wissen.
 *
 * Ondernemers moeten hun administratie 7 jaar bewaren (fiscale bewaarplicht).
 * Verwijderen wist alles in één keer en is niet terug te draaien. Daarom moet
 * het verzoek expliciet `exportConfirmed: true` bevatten: het vinkje "ik heb
 * een export gemaakt en bewaard" in het verwijderscherm.
 */

/** True alleen bij een letterlijke `exportConfirmed: true` in de body. */
export function exportConfirmed(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { exportConfirmed?: unknown }).exportConfirmed === true;
}

export const EXPORT_CONFIRMATION_REQUIRED = {
  /** Voor de gebruiker die zijn eigen account verwijdert. */
  self: {
    code: "export_required",
    error:
      "Maak eerst een export van je gegevens en bevestig dat je die hebt bewaard. Je moet je administratie 7 jaar bewaren, en na het verwijderen kunnen we niets meer terughalen.",
  },
  /** Voor een beheerder die een klantaccount verwijdert. */
  admin: {
    code: "export_required",
    error:
      "Bevestig eerst dat de klant een export van zijn gegevens heeft (of heeft gekregen). De klant moet zijn administratie 7 jaar bewaren, en na het verwijderen is niets meer terug te halen.",
  },
} as const;
