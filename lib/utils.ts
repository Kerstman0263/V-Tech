// Kleine UI-helper om Tailwind-classes voorwaardelijk samen te voegen.
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Format geldbedrag volgens locale.
export function formatMoney(
  amount: number,
  locale: string = "nl",
  currency: string = "EUR",
): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US", {
    style: "currency",
    currency,
  }).format(amount);
}
