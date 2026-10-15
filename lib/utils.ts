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
/** Datum leesbaar in de taal van de gebruiker: "15 okt 2026". Werkt op ISO-strings en Dates (UTC-dag). */
export function formatDate(value: string | Date, locale: string = "nl"): string {
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Uren in de taal van de gebruiker: "92 u", "12,5 u" (max. 1 decimaal). */
export function formatHours(hours: number, locale: string = "nl"): string {
  return `${hours.toLocaleString(locale === "nl" ? "nl-NL" : "en-US", { maximumFractionDigits: 1 })} ${locale === "nl" ? "u" : "h"}`;
}

/** Kilometers afgerond met duizendtalscheiding: "1.240 km". */
export function formatKm(km: number, locale: string = "nl"): string {
  return `${Math.round(km).toLocaleString(locale === "nl" ? "nl-NL" : "en-US")} km`;
}

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
