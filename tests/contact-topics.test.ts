import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTACT_TOPICS,
  STARTGESPREK_HREF,
  STARTGESPREK_MINUTES,
  isStartgesprekSubject,
  parseContactTopic,
  subjectForTopic,
} from "@/lib/contact-topics";
import { contactSchema } from "@/lib/validations/contact";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const messages = (locale: "nl" | "en") => JSON.parse(read(`messages/${locale}.json`));

describe("parseContactTopic", () => {
  it("accepteert alleen bekende onderwerpen", () => {
    expect(parseContactTopic("startgesprek")).toBe("startgesprek");
    expect(parseContactTopic(" Startgesprek ")).toBe("startgesprek");
  });

  it("negeert onbekende, lege en vreemde waarden", () => {
    for (const value of ["", "onbekend", "startgesprek2", "<script>", "startgesprek;drop", undefined, null, 1, ["startgesprek"]]) {
      expect(parseContactTopic(value)).toBeNull();
    }
  });
});

describe("subjectForTopic", () => {
  it("laat een gewoon bericht ongemoeid", () => {
    expect(subjectForTopic(null, "Vraag over btw")).toBe("Vraag over btw");
    expect(subjectForTopic(null, "   ")).toBeNull();
    expect(subjectForTopic(undefined, undefined)).toBeNull();
  });

  it("zet bij een startgesprek altijd 'Startgesprek' vooraan", () => {
    expect(subjectForTopic("startgesprek", "")).toBe("Startgesprek");
    expect(subjectForTopic("startgesprek", "Startgesprek")).toBe("Startgesprek");
    expect(subjectForTopic("startgesprek", "Startgesprek (intro call)")).toBe("Startgesprek (intro call)");
    expect(subjectForTopic("startgesprek", "Intro call")).toBe("Startgesprek: Intro call");
    expect(subjectForTopic("startgesprek", "Overstappen van ander pakket")).toBe("Startgesprek: Overstappen van ander pakket");
  });

  it("blijft binnen de maximale onderwerplengte", () => {
    expect(subjectForTopic("startgesprek", "x".repeat(160))!.length).toBe(160);
  });
});

describe("isStartgesprekSubject", () => {
  it("herkent een opgeslagen aanvraag", () => {
    expect(isStartgesprekSubject("Startgesprek")).toBe(true);
    expect(isStartgesprekSubject("Startgesprek: overstappen")).toBe(true);
    expect(isStartgesprekSubject(subjectForTopic("startgesprek", "iets anders"))).toBe(true);
    expect(isStartgesprekSubject("Vraag")).toBe(false);
    expect(isStartgesprekSubject(null)).toBe(false);
  });
});

describe("contactSchema", () => {
  const base = { name: "Test", email: "test@voorbeeld.nl", message: "Dit is een bericht." };

  it("accepteert berichten met en zonder onderwerp-sleutel", () => {
    expect(contactSchema.safeParse(base).success).toBe(true);
    expect(contactSchema.safeParse({ ...base, topic: "startgesprek" }).success).toBe(true);
  });

  it("weigert een te lange onderwerp-sleutel", () => {
    expect(contactSchema.safeParse({ ...base, topic: "x".repeat(41) }).success).toBe(false);
  });
});

describe("startgesprek-link en teksten", () => {
  it("de knop opent het contactformulier met een bekend onderwerp", () => {
    const url = new URL(STARTGESPREK_HREF, "https://voorbeeld.nl");
    expect(url.pathname).toBe("/contact");
    expect(parseContactTopic(url.searchParams.get("onderwerp"))).toBe("startgesprek");
  });

  it("heeft alle teksten in nl en en, zonder beloofde reactietijd", () => {
    for (const locale of ["nl", "en"] as const) {
      const m = messages(locale);
      expect(m.startgesprek.title).toContain("{minutes}");
      expect(m.startgesprek.button).toBeTruthy();
      expect(m.admin.startgesprekBadge).toBeTruthy();
      for (const topic of CONTACT_TOPICS) {
        const tt = m.contact.topics[topic];
        for (const key of ["subject", "noteTitle", "noteText", "messagePlaceholder", "successText"]) {
          expect(tt[key], `${locale}.contact.topics.${topic}.${key}`).toBeTruthy();
        }
        // Wat de bezoeker vooraf ingevuld krijgt, moet de server als startgesprek herkennen.
        expect(isStartgesprekSubject(subjectForTopic(topic, tt.subject))).toBe(true);
      }
      const all = JSON.stringify([m.startgesprek, m.contact.topics]);
      expect(all).not.toMatch(/\b(binnen|within)\s+\d|\b\d+\s*(uur|uren|hours?|werkdagen|dagen|days?)\b/i);
    }
    expect(STARTGESPREK_MINUTES).toBe(30);
  });

  it("bouwt het formulier opnieuw op als het onderwerp in de URL wisselt", () => {
    // Zonder key houdt de App Router het oude onderwerp en de oude bevestiging vast.
    expect(read("app/[locale]/contact/page.tsx")).toMatch(/<ContactForm\s+key=\{topic \?\? "none"\}/);
  });

  it("staat op overstappen, zzp, de prijzen en de startpagina in de app", () => {
    for (const page of [
      "app/[locale]/overstappen/page.tsx",
      "app/[locale]/zzp/page.tsx",
      "app/[locale]/page.tsx",
      "app/[locale]/(dashboard)/start/page.tsx",
    ]) {
      expect(read(page), page).toContain("<StartgesprekCta");
    }
  });
});
