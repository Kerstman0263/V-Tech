// Gedeelde types voor de webshopkoppelingen. Bewust zonder imports zodat dit
// zowel client- als serverside (en in tests) bruikbaar is.

export type WebshopPlatformKey = "SHOPIFY" | "WOOCOMMERCE" | "BOLCOM" | "CSV";

/** Eén bestelling (of retour) zoals Saldova hem opslaat, los van het platform. */
export interface NormalizedOrder {
  externalId: string;
  orderNumber: string | null;
  kind: "SALE" | "REFUND";
  /** YYYY-MM-DD (datum van de bestelling of de retour). */
  orderDate: string;
  /** ISO-2 afleverland, hoofdletters; null = onbekend. */
  country: string | null;
  currency: string;
  /** Incl. btw en verzending, altijd positief (kind bepaalt de richting). */
  totalGross: number;
  vatAmount: number;
  shippingGross: number;
  fees: number;
  isBusiness: boolean;
  /**
   * Geannuleerd bij het platform EN er is niets voor ontvangen: telt niet mee
   * in omzet en OSS (en niet als "nieuw opgehaald"). We slaan hem toch op
   * (behalve bij `onlyIfKnown`), zodat een eerder opgehaalde verkoop wordt
   * gemarkeerd in plaats van stil te blijven meetellen. Betaald en
   * geannuleerd zonder terugbetaling blijft gewoon een verkoop (btw over
   * ontvangen geld is verschuldigd zolang het niet is terugbetaald).
   */
  cancelled?: boolean;
  /**
   * Alleen opslaan als er al een rij voor bestaat (dan markeren als
   * geannuleerd). Voor bestellingen die nooit omzet worden, zoals een
   * mislukte of afgebroken checkout: die hoeven niet in de tabel.
   */
  onlyIfKnown?: boolean;
  /**
   * De datum is een benadering (het platform geeft geen eigen datum, zoals bij
   * een WooCommerce-retour). Een opgeslagen rij houdt dan zijn datum, zodat
   * hij niet bij elke latere wijziging van de order naar een ander kwartaal
   * verschuift.
   */
  keepStoredDate?: boolean;
}

/** Afronden op centen zonder zwevendekomma-rommel. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
