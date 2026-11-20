import { describe, expect, it } from "vitest";
import {
  buildInvoiceSnapshot, invoiceParties, issueProblem, parseInvoiceSnapshot, prepareIssue, type SnapshotSource,
} from "@/lib/invoice-snapshot";
import {
  changedOwnerOnlySettings, maskIban, MAX_NUMBER_SKIP, numberingChange, numberingLabel, paymentTermsChangeLabel,
} from "@/lib/invoice-settings-change";
import { updateInvoiceSettingsSchema } from "@/lib/validations/invoice-settings";

// Nep-ontsleuteling: "enc:" ervoor = versleuteld (zoals in de database).
const fakeDecrypt = (v: string | null | undefined) => (v ? v.replace(/^enc:/, "") : null);

function live(overrides: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    userEmail: "jan@example.nl",
    company: { name: "Jansen Advies", address: "enc:Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht", country: "NL", vatNumber: "enc:NL001234567B01", kvkNumber: "enc:12345678" },
    customer: { name: "Klant BV", email: "klant@example.nl", address: "enc:Kade 2", postalCode: "1000 AA", city: "Amsterdam", country: "NL", vatNumber: null },
    settings: { korEnabled: false, paymentTerms: "IBAN NL91 ABNA 0417 1643 00 t.n.v. Jansen", footerText: "KvK 12345678" },
    vatScheme: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------- momentopname (nr 10)

describe("momentopname bij het uitreiken (nr 10)", () => {
  it("legt verkoper, klant, KOR, btw-soort, betaalgegevens en voettekst vast, gevoelige velden versleuteld", () => {
    const snap = buildInvoiceSnapshot(live(), new Date("2026-11-18T10:00:00Z"));
    expect(snap).toMatchObject({
      version: 1, takenAt: "2026-11-18T10:00:00.000Z", korEnabled: false, vatScheme: "STANDARD",
      paymentTerms: "IBAN NL91 ABNA 0417 1643 00 t.n.v. Jansen", footerText: "KvK 12345678",
    });
    expect(snap.seller.vatNumber).toBe("enc:NL001234567B01");
    expect(snap.customer.address).toBe("enc:Kade 2");
    expect(parseInvoiceSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it("een uitgereikte factuur toont de gegevens van toen, ook als klant, IBAN of KOR later wijzigen", () => {
    const snapshot = buildInvoiceSnapshot(live());
    const changed = live({
      company: { name: "Nieuwe Naam BV", address: "enc:Elders 9", city: "Rotterdam", vatNumber: "enc:NL999999999B01", kvkNumber: "enc:87654321" },
      customer: { name: "Klant BV", address: "enc:Verhuisd 5", city: "Den Haag", vatNumber: "NL111" },
      settings: { korEnabled: true, paymentTerms: "IBAN NL02 ABNA 0123 4567 89", footerText: null },
    });
    const parties = invoiceParties({ snapshot, vatScheme: null }, changed, fakeDecrypt);
    expect(parties.frozen).toBe(true);
    expect(parties.seller).toMatchObject({ name: "Jansen Advies", address: "Dorpsstraat 1", vatNumber: "NL001234567B01", kvkNumber: "12345678" });
    expect(parties.customer).toMatchObject({ address: "Kade 2", city: "Amsterdam" });
    expect(parties.korEnabled).toBe(false);
    expect(parties.paymentTerms).toContain("NL91 ABNA");
    expect(parties.footerText).toBe("KvK 12345678");
  });

  it("oude facturen en concepten zonder momentopname vallen terug op de huidige gegevens", () => {
    for (const snapshot of [null, undefined, {}, { version: 2 }, "kapot"]) {
      const parties = invoiceParties({ snapshot, vatScheme: null }, live(), fakeDecrypt);
      expect(parties.frozen).toBe(false);
      expect(parties.seller.name).toBe("Jansen Advies");
      expect(parties.seller.address).toBe("Dorpsstraat 1");
    }
  });

  it("zonder bedrijfsnaam is de afzender het e-mailadres (zoals voorheen)", () => {
    expect(buildInvoiceSnapshot(live({ company: null })).seller.name).toBe("jan@example.nl");
  });

  it("uitreiken met btw verlegd controleert de gegevens van dat moment", () => {
    const eu = buildInvoiceSnapshot(live({ vatScheme: "REVERSE_EU", customer: { name: "Client SA", country: "BE", vatNumber: null } }));
    expect(issueProblem(eu, [0], false)).toMatch(/btw-nummer van de klant/);
    const ok = buildInvoiceSnapshot(live({ vatScheme: "REVERSE_EU", customer: { name: "Client SA", country: "BE", vatNumber: "BE0123456789" } }));
    expect(issueProblem(ok, [0], false)).toBeNull();
    // KOR aan: een concept met 21% gaat niet de deur uit.
    const kor = buildInvoiceSnapshot(live({ settings: { korEnabled: true } }));
    expect(issueProblem(kor, [21], false)).toMatch(/KOR/);
  });

  it("prepareIssue: maakt een momentopname voor een concept, en laat een bestaande staan", async () => {
    const row = {
      id: "inv1", userId: "a1", status: "DRAFT", total: 100, originalInvoiceId: null, vatScheme: null, snapshot: null as unknown,
      lineItems: [{ vatRate: 21 }],
      customer: live().customer,
      user: { email: "jan@example.nl", locale: "nl", company: live().company, invoiceSettings: live().settings },
    };
    const client = { invoice: { findFirst: async () => row } } as unknown as Parameters<typeof prepareIssue>[0];
    const first = await prepareIssue(client, "a1", "inv1", new Date("2026-11-18T10:00:00Z"));
    expect(first.problem).toBeNull();
    expect(parseInvoiceSnapshot(first.snapshot)?.takenAt).toBe("2026-11-18T10:00:00.000Z");
    row.snapshot = first.snapshot;
    expect(await prepareIssue(client, "a1", "inv1")).toEqual({ snapshot: undefined, problem: null });
  });
});

// ---------------------------------------------------------------- betaalgegevens alleen door de eigenaar (nr 6)

describe("betaalgegevens, KOR en huisstijl: alleen de eigenaar (nr 6)", () => {
  const current = { paymentTerms: "IBAN NL91ABNA0417164300", korEnabled: false, accentColor: "#2563eb", footerText: null };

  it("ziet alleen echte wijzigingen (meesturen met dezelfde waarde telt niet)", () => {
    expect(changedOwnerOnlySettings({ paymentTerms: "IBAN NL91ABNA0417164300", accentColor: "#2563eb", footerText: "" }, current)).toEqual([]);
    expect(changedOwnerOnlySettings({ paymentTerms: "IBAN NL02ABNA0123456789" }, current)).toEqual(["paymentTerms"]);
    expect(changedOwnerOnlySettings({ korEnabled: true, footerText: "Voorwaarden" }, current)).toEqual(["korEnabled", "footerText"]);
  });

  it("schermt het IBAN af in logboek en e-mail", () => {
    expect(maskIban("NL91ABNA0417164300")).toBe("NL91 **** 4300");
    expect(paymentTermsChangeLabel("IBAN NL91 ABNA 0417 1643 00", "IBAN NL02 ABNA 0123 4567 89")).toBe("NL91 **** 4300 → NL02 **** 6789");
    expect(paymentTermsChangeLabel("IBAN NL91ABNA0417164300 t.n.v. A", "IBAN NL91ABNA0417164300 t.n.v. B")).toMatch(/tenaamstelling/);
    expect(paymentTermsChangeLabel(null, "Betaal contant")).toBe("geen IBAN (tekst of tenaamstelling gewijzigd)");
    const label = paymentTermsChangeLabel("IBAN NL91ABNA0417164300", "IBAN NL02ABNA0123456789");
    expect(label).not.toContain("0417164300");
  });
});

// ---------------------------------------------------------------- nummering (nr 69)

describe("factuurnummering wijzigen (nr 69)", () => {
  const current = { invoicePrefix: "2026-", nextNumber: 8, numberPadding: 4 };
  const change = (next: Partial<typeof current>, extra: { hasInvoices?: boolean; prefixInUse?: boolean } = {}) =>
    numberingChange({ current, next, hasInvoices: extra.hasInvoices ?? true, prefixInUse: extra.prefixInUse ?? false });

  it("dezelfde waarden meesturen is geen wijziging", () => {
    expect(change({ nextNumber: 8, invoicePrefix: "2026-" })).toMatchObject({ changed: false, problem: null });
  });

  it("binnen een reeks: niet terug, maximaal 10 omhoog, zelfde opvulling", () => {
    expect(change({ nextNumber: 7 }).problem).toMatch(/alleen omhoog/);
    expect(change({ nextNumber: 8 + MAX_NUMBER_SKIP }).problem).toBeNull();
    expect(change({ nextNumber: 9 + MAX_NUMBER_SKIP }).problem).toMatch(/grote sprong/);
    expect(change({ numberPadding: 5 }).problem).toMatch(/nieuwe reeks/);
  });

  it("een nieuwe reeks (ongebruikt voorvoegsel) mag opnieuw beginnen of de opvulling wijzigen", () => {
    expect(change({ invoicePrefix: "2027-", nextNumber: 1, numberPadding: 3 })).toMatchObject({ changed: true, problem: null });
    expect(change({ invoicePrefix: "2025-", nextNumber: 1 }, { prefixInUse: true }).problem).toMatch(/al op een factuur/);
  });

  it("zonder facturen mag alles (doornummeren vanuit een ander pakket), binnen de bovengrens", () => {
    expect(change({ nextNumber: 347 }, { hasInvoices: false }).problem).toBeNull();
    expect(change({ nextNumber: 100_000_000 }, { hasInvoices: false }).problem).toMatch(/tussen 1 en/);
    expect(updateInvoiceSettingsSchema.safeParse({ nextNumber: 100_000_000 }).success).toBe(false);
  });

  it("logt de oude en nieuwe nummering leesbaar", () => {
    expect(numberingLabel(current)).toBe("2026-0008");
  });
});

// ---------------------------------------------------------------- taal en btw-nummer in de momentopname

describe("momentopname: taal en btw-nummer van de klant", () => {
  it("legt de taal vast; een latere taalwissel verandert een uitgereikte factuur niet", () => {
    const snapshot = buildInvoiceSnapshot(live({ locale: "nl" }));
    expect(snapshot.locale).toBe("nl");
    expect(invoiceParties({ snapshot, vatScheme: null }, live({ locale: "en" }), fakeDecrypt).locale).toBe("nl");
    // Concept of oude factuur: de huidige taal.
    expect(invoiceParties({ snapshot: null, vatScheme: null }, live({ locale: "en" }), fakeDecrypt).locale).toBe("en");
    // Momentopname van vóór dit veld: ook geldig, met de huidige taal.
    const { locale: _ignored, ...older } = snapshot;
    void _ignored;
    expect(parseInvoiceSnapshot(older)).not.toBeNull();
    expect(invoiceParties({ snapshot: older, vatScheme: null }, live({ locale: "en" }), fakeDecrypt).locale).toBe("en");
  });

  it("legt het btw-nummer van de klant genormaliseerd vast", () => {
    const snap = buildInvoiceSnapshot(live({ customer: { name: "Oud", vatNumber: "nl1234.56.789.b01" } }));
    expect(snap.customer.vatNumber).toBe("NL123456789B01");
    expect(buildInvoiceSnapshot(live()).customer.vatNumber).toBeNull();
  });
});
