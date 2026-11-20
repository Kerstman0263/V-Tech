/**
 * Bewaren van offertes en wat er aan een klant hangt.
 *
 * Een offerte die is verstuurd, ondertekend of omgezet hoort bij de
 * administratie (bewaarplicht 7 jaar, art. 52 AWR): een getekende offerte is
 * het bewijs van de afspraak. Die verwijderen we dus niet. Alleen een concept
 * dat nooit is verstuurd of ondertekend mag weg.
 * Puur (geen database), zodat het los te testen is.
 */

export interface QuoteRetentionFields {
  status: string;
  signatureName?: string | null;
  acceptedAt?: Date | null;
  depositInvoiceId?: string | null;
  convertedInvoiceId?: string | null;
}

export interface RetentionBlock {
  code: string;
  message: string;
}

/** Is dit een concept dat nergens naartoe is gegaan en nergens aan vastzit? */
export function isDeletableQuote(quote: QuoteRetentionFields): boolean {
  return quote.status === "DRAFT" && !quote.signatureName && !quote.acceptedAt && !quote.depositInvoiceId && !quote.convertedInvoiceId;
}

/** Waarom kan deze offerte niet weg? null = hij mag weg. */
export function quoteDeleteBlock(quote: QuoteRetentionFields): RetentionBlock | null {
  if (isDeletableQuote(quote)) return null;
  if (quote.signatureName || quote.acceptedAt || quote.status === "ACCEPTED" || quote.status === "CONVERTED") {
    return {
      code: "quote_signed",
      message: "Deze offerte is geaccepteerd. Hij is het bewijs van de afspraak en moet 7 jaar bewaard blijven, dus verwijderen kan niet.",
    };
  }
  if (quote.depositInvoiceId || quote.convertedInvoiceId) {
    return {
      code: "quote_invoiced",
      message: "Bij deze offerte hoort een factuur. Hij blijft daarom bewaard en kan niet worden verwijderd.",
    };
  }
  return {
    code: "quote_sent",
    message: "Deze offerte is al verstuurd en hoort bij je administratie (bewaarplicht 7 jaar). Verwijderen kan alleen bij een concept. Zet hem zo nodig op 'Afgewezen' of 'Verlopen'.",
  };
}

/** Mag de status zo worden gewijzigd? Niet terug naar concept na verzenden of tekenen. */
export function quoteStatusChangeBlock(quote: QuoteRetentionFields, next: string): RetentionBlock | null {
  if (quote.status === next) return null;
  if (next === "DRAFT" && !isDeletableQuote({ ...quote, status: "DRAFT" })) {
    return quoteDeleteBlock(quote) ?? { code: "quote_sent", message: "Deze offerte kan niet terug naar concept." };
  }
  if (next === "DRAFT" && quote.status !== "DRAFT") {
    return {
      code: "quote_sent",
      message: "Een verstuurde offerte kan niet terug naar concept. Zet hem zo nodig op 'Afgewezen' of 'Verlopen'.",
    };
  }
  // Een ondertekende offerte blijft ondertekend: niet terugzetten naar 'Verzonden'.
  if ((quote.signatureName || quote.acceptedAt) && next === "SENT") {
    return { code: "quote_signed", message: "Deze offerte is digitaal ondertekend en kan niet terug naar 'Verzonden'." };
  }
  return null;
}

export interface CustomerLinks {
  /** Offertes die geen concept (meer) zijn: die blokkeren het verwijderen. */
  keptQuotes: number;
  /** Concept-offertes: die gaan mee weg. */
  draftQuotes: number;
  /** Periodieke facturen (actief of gepauzeerd): die gaan mee weg. */
  schedules: number;
  activeSchedules: number;
}

export type CustomerDeleteDecision =
  | { ok: true }
  | { ok: false; status: 409; code: "HAS_QUOTES"; error: string; quotes: number }
  | { ok: false; status: 409; code: "CONFIRM_LINKED"; error: string; draftQuotes: number; schedules: number; activeSchedules: number };

/**
 * Mag de klant weg? Facturen blokkeren al via de database (Restrict).
 * - Bewaarde offertes (verstuurd, ondertekend, omgezet): nee.
 * - Concept-offertes en periodieke facturen gaan mee weg, maar alleen na een
 *   expliciete bevestiging waarin staat wat er verdwijnt.
 */
export function customerDeleteDecision(links: CustomerLinks, confirmed: boolean): CustomerDeleteDecision {
  if (links.keptQuotes > 0) {
    return {
      ok: false, status: 409, code: "HAS_QUOTES", quotes: links.keptQuotes,
      error: "Deze klant heeft verstuurde of geaccepteerde offertes. Die moeten bewaard blijven, dus de klant kan niet worden verwijderd.",
    };
  }
  if (!confirmed && (links.draftQuotes > 0 || links.schedules > 0)) {
    return {
      ok: false, status: 409, code: "CONFIRM_LINKED", draftQuotes: links.draftQuotes, schedules: links.schedules, activeSchedules: links.activeSchedules,
      error: "Bij deze klant horen nog concept-offertes of periodieke facturen. Die worden ook verwijderd. Bevestig dat dat de bedoeling is.",
    };
  }
  return { ok: true };
}
