import { describe, it, expect } from "vitest";
import {
  COMPANY,
  ONLINE_PAYMENTS_UNAVAILABLE,
  REQUIRED_COMPANY_FIELDS,
  assertSubscriptionSalesAllowed,
  compactPendingNotes,
  companyDetailsComplete,
  formatAddress,
  isLaunched,
  isRegistered,
  missingCompanyFields,
  onlinePaymentsConfigured,
  pendingMessageKey,
  privacyContactEmail,
  subscriptionSalesAllowed,
  type CompanyInfo,
} from "@/lib/company";
import { legalContent } from "@/lib/legal/content";
import { HttpError } from "@/lib/http-error";
import { LAUNCH_DEPENDENT_FAQ, faqAnswerKey } from "@/lib/faq";
import { windowsPageStage } from "@/lib/desktop";
import nl from "@/messages/nl.json";
import en from "@/messages/en.json";

// Overduidelijk nep-gegevens, alleen voor de tests (example.com is gereserveerd).
const EMPTY: CompanyInfo = {
  tradeName: "Saldova",
  legalForm: null,
  ownerName: null,
  address: null,
  kvkNumber: null,
  vatId: null,
  email: null,
  privacyEmail: null,
};
const FILLED: CompanyInfo = {
  tradeName: "Saldova",
  legalForm: "eenmanszaak",
  ownerName: "Test Eigenaar",
  address: { street: "Voorbeeldstraat 1", postalCode: "0000 XX", city: "Voorbeeldstad", country: "Nederland" },
  kvkNumber: "00000000",
  vatId: "NL000000000B00",
  email: "info@example.com",
  privacyEmail: null,
};
const WITH_KEY = { MOLLIE_API_KEY: "test_dummy" };
const NO_KEY = {};

describe("Bedrijfsgegevens van Saldova (lib/company.ts)", () => {
  it("bevat geen verzonnen gegevens: alles wat niet bekend is staat op null", () => {
    expect(COMPANY.tradeName).toBe("Saldova");
    expect(COMPANY.kvkNumber).toBeNull();
    expect(COMPANY.vatId).toBeNull();
    expect(COMPANY.address).toBeNull();
    expect(COMPANY.email).toBeNull();
  });

  it("noemt alle verplichte gegevens die ontbreken, in vaste volgorde", () => {
    expect(missingCompanyFields(EMPTY)).toEqual(["kvkNumber", "vatId", "address", "email"]);
    expect(missingCompanyFields(FILLED)).toEqual([]);
    expect(missingCompanyFields({ ...FILLED, vatId: null })).toEqual(["vatId"]);
    expect(companyDetailsComplete(FILLED)).toBe(true);
    expect(companyDetailsComplete({ ...FILLED, email: null })).toBe(false);
  });

  it("ziet lege tekst en een half adres als ontbrekend", () => {
    expect(missingCompanyFields({ ...FILLED, kvkNumber: "   " })).toEqual(["kvkNumber"]);
    expect(missingCompanyFields({ ...FILLED, address: { ...FILLED.address!, city: "" } })).toEqual(["address"]);
  });

  it("naam en eigenaar zijn niet verplicht voor de lancering", () => {
    expect(missingCompanyFields({ ...FILLED, legalForm: null, ownerName: null })).toEqual([]);
  });

  it("is ingeschreven zodra er een KvK-nummer staat", () => {
    expect(isRegistered(EMPTY)).toBe(false);
    expect(isRegistered({ ...EMPTY, kvkNumber: "00000000" })).toBe(true);
  });

  it("online betalen staat aan als MOLLIE_API_KEY gezet is", () => {
    expect(onlinePaymentsConfigured(WITH_KEY)).toBe(true);
    expect(onlinePaymentsConfigured(NO_KEY)).toBe(false);
    expect(onlinePaymentsConfigured({ MOLLIE_API_KEY: "" })).toBe(false);
  });

  it("is pas gelanceerd met alle verplichte gegevens én online betalen", () => {
    expect(isLaunched(FILLED, WITH_KEY)).toBe(true);
    expect(isLaunched(FILLED, NO_KEY)).toBe(false);
    expect(isLaunched(EMPTY, WITH_KEY)).toBe(false);
    expect(isLaunched({ ...FILLED, address: null }, WITH_KEY)).toBe(false);
    // De echte gegevens zijn nog niet ingevuld: dus nu nog niet gelanceerd, ook met sleutel.
    expect(isLaunched(COMPANY, WITH_KEY)).toBe(false);
  });

  it("de checkout weigert met 503 en dezelfde melding als zonder Mollie-sleutel zolang gegevens ontbreken", () => {
    expect(subscriptionSalesAllowed(EMPTY)).toBe(false);
    let error: unknown;
    try {
      assertSubscriptionSalesAllowed(EMPTY);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(503);
    expect((error as HttpError).message).toBe(ONLINE_PAYMENTS_UNAVAILABLE);
    expect(() => assertSubscriptionSalesAllowed(FILLED)).not.toThrow();
  });

  it("privacyvragen gaan naar het privacyadres, anders naar het algemene adres", () => {
    expect(privacyContactEmail(EMPTY)).toBeNull();
    expect(privacyContactEmail(FILLED)).toBe("info@example.com");
    expect(privacyContactEmail({ ...FILLED, privacyEmail: "privacy@example.com" })).toBe("privacy@example.com");
  });

  it("zet het adres op één regel, met het land alleen buiten Nederland", () => {
    expect(formatAddress(FILLED.address!)).toBe("Voorbeeldstraat 1, 0000 XX Voorbeeldstad");
    expect(formatAddress({ ...FILLED.address!, country: "België" })).toBe("Voorbeeldstraat 1, 0000 XX Voorbeeldstad, België");
  });

  it("zegt 'na inschrijving bij de KvK' alleen zolang er geen KvK-nummer is", () => {
    expect(pendingMessageKey("kvkNumber", EMPTY)).toBe("pending.kvkNumber");
    expect(pendingMessageKey("vatId", EMPTY)).toBe("pending.vatId");
    expect(pendingMessageKey("address", EMPTY)).toBe("pending.address");
    expect(pendingMessageKey("registration", EMPTY, true)).toBe("pendingCompact.registration");
    // Alleen het KvK-nummer ingevuld: btw-id en adres volgen niet meer "na inschrijving".
    const onlyKvk = { ...EMPTY, kvkNumber: "00000000" };
    expect(pendingMessageKey("vatId", onlyKvk)).toBe("pendingRegistered.vatId");
    expect(pendingMessageKey("address", onlyKvk)).toBe("pendingRegistered.address");
    expect(pendingMessageKey("vatId", onlyKvk, true)).toBe("pendingCompactRegistered.vatId");
    expect(pendingMessageKey("address", onlyKvk, true)).toBe("pendingCompactRegistered.address");
    expect(pendingMessageKey("email", onlyKvk)).toBe("pending.email");
    expect(pendingMessageKey("email", onlyKvk, true)).toBe("pendingCompact.email");
  });

  it("de footer toont één regel zolang de inschrijving nog moet, daarna per ontbrekend veld", () => {
    expect(compactPendingNotes(EMPTY)).toEqual(["registration", "email"]);
    expect(compactPendingNotes(FILLED)).toEqual([]);
    expect(compactPendingNotes({ ...FILLED, vatId: null, email: null })).toEqual(["vatId", "email"]);
  });
});

describe("Juridische teksten volgen de bedrijfsgegevens", () => {
  const docs = ["privacy", "terms", "dpa"] as const;

  it("zolang Saldova niet ingeschreven is: 'in oprichting' en de melding", () => {
    for (const locale of ["nl", "en"]) {
      const content = legalContent(locale, EMPTY);
      for (const doc of docs) expect(content[doc].notice).toBeTruthy();
    }
    // Standaard (de echte, nog lege gegevens) is precies hetzelfde.
    expect(legalContent("nl")).toEqual(legalContent("nl", EMPTY));
    expect(legalContent("en")).toEqual(legalContent("en", EMPTY));
  });

  // Zonder KvK-nummer moet de juridische tekst letterlijk de tekst zijn die er stond vóór
  // lib/company.ts (die moet de eigenaar goedkeuren). Eerst de zinnen die van de gegevens afhangen...
  it("zonder inschrijving: letterlijk de oude zinnen en meldingen", () => {
    const oldNoticeNl = "Saldova is in oprichting. Zodra de inschrijving bij de Kamer van Koophandel rond is, vermelden we hier de bedrijfsnaam, het KvK-nummer en het vestigingsadres.";
    const oldNoticeEn = "Saldova is being established. Once registration with the Dutch Chamber of Commerce is complete, we will list the company name, registration number and address here.";
    const nlText = legalContent("nl", EMPTY);
    const enText = legalContent("en", EMPTY);
    expect(nlText.privacy.notice).toBe(`${oldNoticeNl} Tot die tijd bereik je ons via het contactformulier.`);
    expect(nlText.terms.notice).toBe(oldNoticeNl);
    expect(nlText.dpa.notice).toBe(oldNoticeNl);
    expect(enText.privacy.notice).toBe(`${oldNoticeEn} Until then you can reach us via the contact form.`);
    expect(enText.terms.notice).toBe(oldNoticeEn);
    expect(enText.dpa.notice).toBe(oldNoticeEn);
    const paragraphs = (lang: typeof nlText) =>
      docs.flatMap((doc) => lang[doc].sections.flatMap((s) => [...(s.p ?? []), ...(s.ul ?? [])]));
    expect(paragraphs(nlText)).toContain(
      "Saldova (in oprichting) is verantwoordelijk voor de verwerking van de gegevens die nodig zijn om je account en abonnement te beheren (bijvoorbeeld je e-mailadres en betaalstatus).",
    );
    expect(paragraphs(nlText)).toContain("Saldova: de online software en de aanbieder daarvan (in oprichting).");
    expect(paragraphs(enText)).toContain(
      "Saldova (being established) is the controller for data needed to manage your account and subscription, such as your email address and payment status.",
    );
    expect(paragraphs(enText)).toContain("Saldova: the online software and its provider (being established).");
  });

  // ...en dan de volledige tekst, vastgelegd in tests/__snapshots__/company.test.ts.snap (gelijk aan
  // de tekst van vóór lib/company.ts). Slaat deze test aan, dan is de juridische inhoud veranderd:
  // laat de eigenaar dat goedkeuren, hoog DOC_VERSIONS op in app/api/register/route.ts en werk pas
  // daarna de snapshot bij (npx vitest run -u).
  it("zonder inschrijving: de volledige juridische tekst is ongewijzigd (nl en en)", () => {
    expect(legalContent("nl", EMPTY)).toMatchSnapshot("nl");
    expect(legalContent("en", EMPTY)).toMatchSnapshot("en");
  });

  it("na inschrijving: de echte gegevens, geen 'in oprichting' meer, verder dezelfde inhoud", () => {
    for (const locale of ["nl", "en"]) {
      const before = legalContent(locale, EMPTY);
      const after = legalContent(locale, FILLED);
      const text = JSON.stringify(after);
      expect(text).not.toContain("in oprichting");
      expect(text).not.toContain("being established");
      expect(text).toContain("00000000");
      expect(text).toContain("Test Eigenaar");
      for (const doc of docs) {
        expect(after[doc].notice).toBeNull();
        expect(after[doc].intro).toBe(before[doc].intro);
        expect(after[doc].sections.map((s) => s.h)).toEqual(before[doc].sections.map((s) => s.h));
      }
    }
    expect(JSON.stringify(legalContent("nl", FILLED))).toContain("Saldova (handelsnaam van Test Eigenaar, KvK 00000000)");
  });

  it("noemt de eigenaar alleen als handelsnaam-houder bij een eenmanszaak", () => {
    const text = JSON.stringify(legalContent("nl", { ...FILLED, legalForm: "bv" }));
    expect(text).toContain("Saldova (KvK 00000000)");
    expect(text).not.toContain("handelsnaam van");
  });
});

describe("Teksten die van de lancering afhangen", () => {
  it("FAQ: vóór de lancering het gewone antwoord, daarna de vervolgtekst", () => {
    expect(faqAnswerKey("payment", false)).toBe("payment.a");
    expect(faqAnswerKey("payment", true)).toBe("payment.aLaunched");
    expect(faqAnswerKey("changePlan", false)).toBe("changePlan.a");
    expect(faqAnswerKey("changePlan", true)).toBe("changePlan.aLaunched");
    // Antwoorden die niets met de lancering te maken hebben, blijven gelijk.
    expect(faqAnswerKey("cancel", true)).toBe("cancel.a");
    expect(faqAnswerKey("security", false)).toBe("security.a");
  });

  it("FAQ: elke vervolgtekst bestaat in beide talen en noemt de lancering niet meer", () => {
    for (const m of [nl, en]) {
      for (const key of LAUNCH_DEPENDENT_FAQ) {
        const answer = (m.faq as unknown as Record<string, { a: string; aLaunched?: string }>)[key].aLaunched;
        expect(answer).toBeTruthy();
        expect(answer).not.toMatch(/lancering|launch/i);
      }
    }
  });

  it("/windows: 'bij de officiële lancering' alleen vóór de lancering", () => {
    expect(windowsPageStage(false, false)).toBe("prelaunch");
    expect(windowsPageStage(false, true)).toBe("prelaunch");
    expect(windowsPageStage(true, false)).toBe("soon");
    expect(windowsPageStage(true, true)).toBe("ready");
    for (const m of [nl, en]) {
      const site = m.desktop.site;
      for (const text of [
        site.steps.plan.descLaunched,
        site.steps.download.descSoon,
        site.steps.download.descReady,
        site.ctaSubtitleSoon,
        site.ctaSubtitleReady,
        site.availability.later,
      ]) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(/lancering|launch/i);
      }
    }
  });
});

describe("Teksten voor de bedrijfsgegevens (messages)", () => {
  it("nl en en hebben dezelfde sleutels", () => {
    const keys = (obj: object, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(en.companyInfo).sort()).toEqual(keys(nl.companyInfo).sort());
  });

  it("elk verplicht veld heeft een 'volgt nog'-tekst", () => {
    for (const field of REQUIRED_COMPANY_FIELDS) {
      expect(nl.companyInfo.pending[field]).toBeTruthy();
      expect(nl.companyInfo.pendingCompact[field]).toBeTruthy();
      expect(en.companyInfo.pending[field]).toBeTruthy();
      expect(en.companyInfo.pendingCompact[field]).toBeTruthy();
    }
    expect(nl.companyInfo.pending.kvkNumber).toBe("Volgt na inschrijving bij de KvK");
  });

  it("na inschrijving noemt geen tekst meer de inschrijving bij de KvK", () => {
    for (const m of [nl, en]) {
      for (const field of ["vatId", "address"] as const) {
        for (const text of [m.companyInfo.pendingRegistered[field], m.companyInfo.pendingCompactRegistered[field]]) {
          expect(text).toBeTruthy();
          expect(text).not.toMatch(/inschrijving|registration|KvK|Chamber of Commerce/i);
        }
      }
    }
  });

  it("elke 'na de lancering'-tekst bestaat in beide talen", () => {
    for (const m of [nl, en]) {
      expect(m.reviews.approvalNote).toBeTruthy();
      expect(m.landing.social.emptyLaunched).toBeTruthy();
      expect(m.landing.cta.subtitleLaunched).toBeTruthy();
      expect(m.home.ctaSubtitleLaunched).toBeTruthy();
      expect(m.home.promises.pay.titleLaunched).toBeTruthy();
      expect(m.home.promises.pay.descLaunched).toBeTruthy();
      expect(m.home.prices.introLaunched).toBeTruthy();
      expect(m.ova.bundles.honestLaunched).toBeTruthy();
    }
  });
});
