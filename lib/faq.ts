/**
 * Veelgestelde vragen (messages: faq.<key>.q / .a). Een paar antwoorden gaan over de tijd vóór de
 * officiële lancering ("Online betalen volgt bij de officiële lancering"). Die hebben een
 * vervolgtekst faq.<key>.aLaunched die verschijnt zodra Saldova gelanceerd is (isLaunched() uit
 * lib/company.ts). Zo spreekt de FAQ de rest van de site na de lancering niet tegen.
 *
 * Puur: ook bruikbaar in clientcomponenten en tests.
 */

/** FAQ-vragen waarvan het antwoord na de lancering anders is (elk heeft faq.<key>.aLaunched). */
export const LAUNCH_DEPENDENT_FAQ = ["payment", "changePlan"] as const;

/**
 * Alle vragen die de hulp-widget (components/landing/HelpHub.tsx) doorzoekbaar maakt: elke vraag
 * van /faq plus een paar die alleen elders staan. Antwoorden met een plaatshouder (zoals {days}
 * in faq.stopping.a) krijgen hun waarden uit guaranteeMessageValues() in lib/export-guarantee.ts.
 */
export const HELP_FAQ_KEYS = [
  "start", "trial", "switch", "tax", "support", "security", "data", "avg", "exportData", "stopping",
  "invoiceLegal", "plans", "payment", "changePlan", "cancel", "wsPlatforms", "wsOss",
] as const;

/** Sleutel van het antwoord op een FAQ-vraag, binnen de namespace "faq". */
export function faqAnswerKey(key: string, launched: boolean): string {
  return launched && (LAUNCH_DEPENDENT_FAQ as readonly string[]).includes(key) ? `${key}.aLaunched` : `${key}.a`;
}

/**
 * FAQ-vragen met een doorverwijzing onder het antwoord (label: faq.<key>.link). De vragen over
 * stoppen en exporteren wijzen naar de exportgarantie (lib/export-guarantee.ts), de vragen over
 * veiligheid en privacy naar de beveiligingspagina (lib/security-page.ts).
 */
export const FAQ_LINKS = {
  stopping: "/exportgarantie",
  data: "/exportgarantie",
  exportData: "/exportgarantie",
  security: "/beveiliging",
  avg: "/beveiliging",
} as const satisfies Record<string, string>;

/** Pad waar het antwoord op deze vraag naar verwijst, of null. */
export function faqLink(key: string): string | null {
  return (FAQ_LINKS as Record<string, string>)[key] ?? null;
}
