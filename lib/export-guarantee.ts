/**
 * Exportgarantie (/exportgarantie): wat Saldova schriftelijk belooft over je gegevens.
 *
 * Elk punt op de pagina is nagelopen in de code. Verandert een van deze plekken, pas dan
 * ook de tekst aan (messages: exportGuarantee.*):
 *  - Export in elk pakket, ook na opzeggen of een verlopen proef: app/api/account/export/route.ts
 *    (geen abonnements- of plancontrole; alleen het recht 'exports') en de downloadknoppen op
 *    components/billing/TrialExpiredGate.tsx (ZIP en auditfile, voor iedereen met dat recht).
 *  - Inhoud van de ZIP: lib/account-export.ts (gegevens/ als JSON en CSV, bonnetjes/ en inbox/
 *    als losse bestanden, facturen/pdf en facturen/ubl, LEESMIJ.txt; geen wachtwoorden,
 *    2FA-gegevens of koppelsleutels).
 *  - Auditfile (XAF) per jaar, los te downloaden bij Btw en op de poort na een verlopen proef of
 *    opzegging: app/api/exports/auditfile/route.ts (ook zonder abonnementscontrole).
 *  - Verwijderen kan in Instellingen. Staat een bedrijfsaccount achter de poort, dan is Instellingen
 *    niet bereikbaar; dan verwijdert een beheerder het account op verzoek (DELETE in
 *    app/api/admin/users/[id]/route.ts, ook met exportbevestiging en Mollie-stop).
 *  - Opzeggen wist niets: cancelRecurringSubscription() in lib/mollie.ts zegt alleen het
 *    Mollie-abonnement op en zet de status op CANCELED; er is geen taak die gegevens wist.
 *  - Verwijderen: eerst de export bevestigen (lib/account-deletion.ts), dan het wachtwoord,
 *    dan de betalingen bij Mollie stopzetten (lib/account-closure.ts; mislukt dat, dan wordt
 *    er niets gewist) en pas daarna wissen (DELETE in app/api/account/route.ts).
 *
 * Puur: ook bruikbaar in clientcomponenten en tests.
 */

/**
 * Zoveel dagen vooraf waarschuwen we klanten als Saldova ooit stopt, zodat ze op hun gemak
 * kunnen exporteren en overstappen.
 *
 * EIGENAAR: bevestig deze termijn. Dit is een belofte aan klanten die de code niet zelf
 * waarmaakt; hij staat op /exportgarantie en in de FAQ ("Wat als Saldova stopt?"). Wijzig je
 * hem, dan verandert de tekst op beide plekken vanzelf mee.
 */
export const SHUTDOWN_NOTICE_DAYS = 90;

/*
 * EIGENAAR: beslis wat er met de export gebeurt als Saldova zelf een account opschort of beëindigt
 * (lib/legal/content.ts, voorwaarden art. 5: "bij misbruik, wanbetaling of overtreding van deze
 * voorwaarden"). In de code bestaat opschorten nu niet, maar de voorwaarden staan het toe. Tot je
 * dat hebt besloten belooft /exportgarantie daar niets over (exportGuarantee.sections.always.desc
 * verwijst naar de voorwaarden). Leg het besluit vast in de voorwaarden en pas die tekst aan.
 */

/** Pad van de pagina (zonder taalprefix), ook in PUBLIC_PAGES in lib/seo.ts. */
export const EXPORT_GUARANTEE_PATH = "/exportgarantie" as const;

/** De onderdelen van de garantie, in de volgorde van de pagina (messages: exportGuarantee.sections.<key>). */
export const GUARANTEE_SECTIONS = ["own", "always", "contents", "cancel", "delete", "stop"] as const;
export type GuaranteeSection = (typeof GUARANTEE_SECTIONS)[number];

/** Wat er in de ZIP-export zit (messages: exportGuarantee.contents.<key>). */
export const EXPORT_CONTENTS = ["data", "files", "invoices", "readme"] as const;

/** De stappen bij het verwijderen van een account, in de volgorde van app/api/account/route.ts. */
export const DELETE_STEPS = ["export", "password", "billing", "erase"] as const;

/** Waarden voor de teksten van de garantie (ICU-plaatshouders). */
export function guaranteeMessageValues(): { days: number } {
  return { days: SHUTDOWN_NOTICE_DAYS };
}

/** Hoeveel jaren de auditfile-keuze toont (het huidige jaar en de jaren ervoor), net als bij Btw. */
export const AUDITFILE_YEARS = 4;

/** De jaren waarvoor je een auditfile kunt kiezen, nieuwste eerst. */
export function auditfileYears(currentYear: number, count: number = AUDITFILE_YEARS): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => currentYear - i);
}

/** Downloadlink van de auditfile (XAF) voor één jaar (app/api/exports/auditfile/route.ts). */
export function auditfileHref(year: number): string {
  return `/api/exports/auditfile?year=${year}&format=xaf`;
}
