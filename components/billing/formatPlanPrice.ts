/**
 * Planprijs zoals op de website: "€ 29" (Nederlandse notatie, hele euro's).
 * Bewust altijd nl-NL, ook in de Engelse app, zodat de prijs overal hetzelfde oogt.
 */
const FORMAT = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPlanPrice(amount: number): string {
  return FORMAT.format(amount);
}

const FORMAT_CENTS = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Bedrag met centen, zoals het bij de incasso wordt afgeschreven: "€ 35,09". */
export function formatChargeAmount(amount: number): string {
  return FORMAT_CENTS.format(amount);
}
