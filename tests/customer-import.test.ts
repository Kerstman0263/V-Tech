import { describe, expect, it } from "vitest";
import { customerKey, parseCustomerCsv } from "@/lib/customer-import";

describe("customer CSV import", () => {
  it("recognises a Moneybird-style export with Dutch headers", () => {
    const csv = "﻿Bedrijfsnaam;Voornaam;Achternaam;E-mailadres;Adres 1;Postcode;Plaats;Land;Btw-nummer\n" +
      "Bakkerij Jansen;Piet;Jansen;Info@Bakkerij.nl;Dorpsstraat 1;1234 ab;Utrecht;Nederland;NL 0012 3456 7B01\n" +
      ";Anna;de Vries;anna@example.nl;;;Gent;België;\n";
    const result = parseCustomerCsv(csv)!;
    expect(result.rows).toEqual([
      { name: "Bakkerij Jansen", email: "info@bakkerij.nl", address: "Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht", country: "NL", vatNumber: "NL001234567B01" },
      { name: "Anna de Vries", email: "anna@example.nl", address: null, postalCode: null, city: "Gent", country: "BE", vatNumber: null },
    ]);
    expect(result.mapped.company).toBe("Bedrijfsnaam");
    expect(result.mapped.email).toBe("E-mailadres");
  });

  it("handles English comma-separated files with quoted fields and newlines", () => {
    const csv = 'Company,Email,Address,Zip,City,Country\n"Smith, Jones & Co",hello@smith.co.uk,"1 High St\nUnit 2",SW1A 1AA,London,GB\n';
    const [row] = parseCustomerCsv(csv)!.rows;
    expect(row.name).toBe("Smith, Jones & Co");
    expect(row.address).toBe("1 High St Unit 2");
    expect(row.country).toBe("GB");
  });

  it("skips rows without a name or with an invalid email and reports them", () => {
    const result = parseCustomerCsv("Naam;Email\n;leeg@example.nl\nKlant;geen-mail\nGoede klant;ok@example.nl\n")!;
    expect(result.rows.map((r) => r.name)).toEqual(["Goede klant"]);
    expect(result.skipped).toEqual([{ line: 1, reason: "no_name" }, { line: 2, reason: "invalid_email" }]);
  });

  it("refuses files without any name column", () => {
    expect(parseCustomerCsv("Email;Plaats\na@b.nl;Utrecht\n")).toBeNull();
    expect(parseCustomerCsv("")).toBeNull();
  });

  it("detects duplicates by email first, then by name", () => {
    expect(customerKey({ name: "Jansen", email: "A@B.nl" })).toBe(customerKey({ name: "Ander", email: "a@b.nl" }));
    expect(customerKey({ name: "Bakkerij  Jansen", email: null })).toBe(customerKey({ name: "bakkerij jansen", email: null }));
  });
});
