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
 * Jaarlijkse betaling: 15% korting ("2 maanden gratis"). Eén bron van waarheid
 * voor de pricing-toggle. De maandprijs bij jaarbetaling = maandprijs × (1 − 15%).
 */
export const YEARLY_DISCOUNT = 0.15;

/** Effectieve maandprijs bij jaarbetaling (afgerond op hele euro's). */
export function monthlyAtYearly(monthly: number): number {
  return Math.round(monthly * (1 - YEARLY_DISCOUNT));
}

/** Totale jaarprijs bij jaarbetaling. */
export function yearlyTotal(monthly: number): number {
  return monthlyAtYearly(monthly) * 12;
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
