// Kleine UI-helper om Tailwind-classes voorwaardelijk samen te voegen.
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Tijd (uu:mm) volgens locale.
export function formatTime(iso: string | Date, locale = "nl"): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Datumlabel voor scheidingslijnen in chats (bijv. "8 jun 2026").
export function formatDateLabel(iso: string | Date, locale = "nl"): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

// Kiest de juiste begroetings-i18n-sleutel op basis van het uur van de dag.
// Geeft een sleutel binnen de "dashboard"-namespace terug.
export function greetingKey(date: Date = new Date()): "greetMorning" | "greetAfternoon" | "greetEvening" {
  const h = date.getHours();
  if (h < 12) return "greetMorning";
  if (h < 18) return "greetAfternoon";
  return "greetEvening";
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
