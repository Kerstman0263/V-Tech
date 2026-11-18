// Marketing-instellingen — bewust eenvoudig en EERLIJK te houden.
// Geen verzonnen cijfers/reviews: pas deze waarden alleen aan als ze écht kloppen.

/**
 * Launch-/actiebalk bovenaan de marketingsite.
 * Zet `enabled` op false om de balk te verbergen. De tekst staat in de i18n
 * (`landing.launch.*`) zodat je 'm waarheidsgetrouw kunt aanpassen.
 */
export const LAUNCH_OFFER = {
  // Uit voor een rustige, betrouwbare uitstraling. Zet op true voor een ECHTE
  // actie (waarheidsgetrouwe tekst in landing.launch.*).
  enabled: false,
} as const;

/**
 * Gemiddeld uurtarief van een boekhouder in NL — gebruikt voor een EERLIJKE
 * prijsvergelijking (anchoring), niet als belofte. Pas aan naar een realistisch
 * bedrag; het is een algemene indicatie, geen exacte claim.
 */
export const ACCOUNTANT_HOURLY_EUR = 75;

/**
 * Planprijs zoals overal op de site: "€ 29" (Nederlandse notatie, hele euro's).
 * Er is alleen maandbetaling; zet "per maand, excl. btw" eronder.
 */
const PLAN_PRICE = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function formatPlanPrice(euros: number): string {
  // Intl zet een vaste (harde) spatie na het €-teken, zodat "€" en het bedrag bij elkaar blijven.
  return PLAN_PRICE.format(euros);
}

/**
 * Urencriterium (Belastingdienst): een zzp'er heeft recht op de
 * zelfstandigenaftrek bij minimaal 1225 uur per jaar besteed aan de
 * onderneming — inclusief INDIRECTE uren (reistijd, administratie, acquisitie),
 * die ondernemers vaak vergeten te schrijven. Saldova helpt beide vast te leggen.
 * Geen belofte over besparing, maar een concrete, controleerbare grens.
 */
export const URENCRITERIUM_HOURS = 1225;
/** Realistisch aantal werkweken per jaar (na ~6 weken vakantie/vrij). */
export const WORK_WEEKS_PER_YEAR = 46;
