import nl from "@/messages/nl.json";
import en from "@/messages/en.json";
import type { PdfLabels } from "@/lib/pdf";
import type { VatScheme } from "@/lib/vat-scheme";

/**
 * Teksten voor de factuur- en offerte-PDF uit messages/{nl,en}.json
 * (namespace "pdf"). Puur, zodat het zonder Next-request werkt en te testen is.
 */
export type PdfLocale = "nl" | "en";

const MESSAGES = { nl, en } as const;

export function pdfLocale(locale: string | null | undefined): PdfLocale {
  return locale === "en" ? "en" : "nl";
}

export interface PdfTexts {
  labels: PdfLabels;
  quote: { title: string; recipient: string; validUntil: string };
  renderError: string;
}

export function pdfTexts(locale: string | null | undefined): PdfTexts {
  const m = MESSAGES[pdfLocale(locale)].pdf;
  const { quoteTitle, quoteRecipient, quoteValidUntil, renderError, ...labels } = m;
  return {
    labels,
    quote: { title: quoteTitle, recipient: quoteRecipient, validUntil: quoteValidUntil },
    renderError,
  };
}

/** De KOR-zin zoals die in elke taal in de opmerkingen kan staan. */
export function korNoticeTexts(): string[] {
  return [nl.invoices.korNotice, en.invoices.korNotice];
}

export function korNoticeText(locale: string | null | undefined): string {
  return MESSAGES[pdfLocale(locale)].invoices.korNotice;
}

/** De creditverwijzing die de credit-route in de opmerkingen zet, in elke taal. */
export function creditNoteTexts(originalNumber: string): string[] {
  return [nl.invoices.creditNote, en.invoices.creditNote].map((t) => t.replace("{number}", originalNumber));
}

/** De creditzin met {number} als plek, in elke taal (om oude opmerkingen te lezen). */
export function creditNoteTemplates(): string[] {
  return [nl.invoices.creditNote, en.invoices.creditNote];
}

/**
 * Wettelijke vermelding op de factuur bij btw verlegd of een intracommunautaire
 * levering (art. 35a Wet OB), in de taal van het account. Null bij gewone btw.
 */
export function vatSchemeNoticeText(scheme: VatScheme, locale: string | null | undefined): string | null {
  if (scheme === "STANDARD") return null;
  return MESSAGES[pdfLocale(locale)].invoices.vatSchemeNotice[scheme];
}
