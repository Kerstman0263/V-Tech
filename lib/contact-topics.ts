// Onderwerpen die het contactformulier vooraf kan invullen via ?onderwerp=…
//
// Alleen sleutels uit deze lijst worden overgenomen; elke andere waarde in de
// URL wordt genegeerd, zodat niemand via een link willekeurige tekst in het
// formulier of in de inbox van de eigenaar kan zetten.
//
// Er is geen agenda-koppeling: een aanvraag voor een startgesprek komt als
// gewoon contactbericht binnen (ContactMessage, onderwerp "Startgesprek") en de
// eigenaar plant het gesprek daarna zelf in.

export const CONTACT_TOPICS = ["startgesprek"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** Vaste onderwerpregel waarmee de eigenaar het bericht in de inbox herkent. */
export const TOPIC_SUBJECT: Record<ContactTopic, string> = {
  startgesprek: "Startgesprek",
};

/** Lengte van het gratis startgesprek in minuten (komt terug in de teksten). */
export const STARTGESPREK_MINUTES = 30;

/** Link naar het contactformulier met het startgesprek vooraf ingevuld. */
export const STARTGESPREK_HREF = "/contact?onderwerp=startgesprek";

/**
 * Zet een queryparameter om naar een bekend onderwerp, of null. Hoofdletters
 * en spaties rondom worden genegeerd (" Startgesprek " wordt "startgesprek");
 * daarna telt alleen een sleutel die precies in CONTACT_TOPICS staat. Arrays
 * (?onderwerp=a&onderwerp=b) en onbekende waarden leveren null op.
 */
export function parseContactTopic(value: unknown): ContactTopic | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return (CONTACT_TOPICS as readonly string[]).includes(key) ? (key as ContactTopic) : null;
}

/**
 * Onderwerpregel die wordt opgeslagen. Bij een bekend onderwerp begint die
 * altijd met de vaste titel (bv. "Startgesprek"), ook als de bezoeker het veld
 * heeft aangepast; wat de bezoeker zelf typte blijft erachter staan.
 */
export function subjectForTopic(topic: ContactTopic | null | undefined, subject: string | null | undefined): string | null {
  const typed = (subject ?? "").trim();
  if (!topic) return typed || null;
  const fixed = TOPIC_SUBJECT[topic];
  if (!typed) return fixed;
  if (typed.toLowerCase().startsWith(fixed.toLowerCase())) return typed;
  return `${fixed}: ${typed}`.slice(0, 160);
}

/** Herkent een opgeslagen contactbericht als aanvraag voor een startgesprek. */
export function isStartgesprekSubject(subject: string | null | undefined): boolean {
  return (subject ?? "").trim().toLowerCase().startsWith(TOPIC_SUBJECT.startgesprek.toLowerCase());
}
