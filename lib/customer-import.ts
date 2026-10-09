import { delimiterFor, records } from "@/lib/fiscal-csv";

/**
 * Klanten importeren uit een CSV-export van een ander pakket (Moneybird,
 * e-Boekhouden, Jortt, SnelStart, Excel...). Kolommen worden herkend op naam,
 * in het Nederlands of Engels; overstappen kost zo geen overtypwerk.
 */

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_BYTES = 2_000_000;

export interface ImportedCustomer {
  name: string;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  vatNumber: string | null;
}

export interface CustomerImportResult {
  rows: ImportedCustomer[];
  /** Regelnummers (1 = eerste dataregel) die zijn overgeslagen, met reden. */
  skipped: { line: number; reason: "no_name" | "invalid_email" | "malformed" }[];
  /** Herkende kolommen, voor de preview ("Bedrijfsnaam -> naam"). */
  mapped: Partial<Record<Field, string>>;
}

type Field = "company" | "firstName" | "lastName" | "name" | "email" | "address" | "address2" | "postalCode" | "city" | "country" | "vatNumber";

// Genormaliseerde kolomnamen (kleine letters, alleen a-z0-9).
const SYNONYMS: Record<Field, string[]> = {
  company: ["bedrijfsnaam", "bedrijf", "organisatie", "companyname", "company", "organization", "organisation", "firma", "relatienaam", "klantnaam", "debiteurnaam"],
  name: ["naam", "name", "contactnaam", "contact", "fullname", "volledigenaam", "klant", "relatie", "debiteur", "customer"],
  firstName: ["voornaam", "firstname", "givenname"],
  lastName: ["achternaam", "lastname", "surname", "familienaam"],
  email: ["email", "emailadres", "e-mail", "mail", "emailaddress", "factuuremail", "invoiceemail", "emailfactuur"],
  address: ["adres", "address", "straat", "street", "adres1", "address1", "addressline1", "straatenhuisnummer", "vestigingsadres", "factuuradres"],
  address2: ["adres2", "address2", "addressline2", "huisnummer", "housenumber"],
  postalCode: ["postcode", "postalcode", "zip", "zipcode", "postcodefactuur"],
  city: ["plaats", "woonplaats", "stad", "city", "town", "vestigingsplaats"],
  country: ["land", "country", "landcode", "countrycode"],
  vatNumber: ["btwnummer", "btwnr", "btw", "btwid", "vatnumber", "vat", "vatid", "taxnumber", "omzetbelastingnummer"],
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const COUNTRIES: Record<string, string> = {
  nederland: "NL", netherlands: "NL", holland: "NL", belgie: "BE", belgium: "BE", duitsland: "DE", germany: "DE", deutschland: "DE",
  frankrijk: "FR", france: "FR", luxemburg: "LU", luxembourg: "LU", verenigdkoninkrijk: "GB", unitedkingdom: "GB", spanje: "ES", spain: "ES",
};

function countryCode(raw: string): string {
  const v = raw.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return COUNTRIES[norm(v)] ?? "NL";
}

const clean = (v: string | undefined, max: number) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

export function parseCustomerCsv(text: string): CustomerImportResult | null {
  const body = text.replace(/^﻿/, "");
  if (!body.trim()) return null;
  const iter = records(body, delimiterFor(body));
  const header = iter.next();
  if (header.done) return null;

  const columns = header.value.cells.map(norm);
  const mapped: Partial<Record<Field, string>> = {};
  const index: Partial<Record<Field, number>> = {};
  // Specifiekere velden eerst, zodat "bedrijfsnaam" niet als gewone naam telt.
  for (const field of Object.keys(SYNONYMS) as Field[]) {
    const i = columns.findIndex((c, idx) => SYNONYMS[field].includes(c) && !Object.values(index).includes(idx));
    if (i >= 0) {
      index[field] = i;
      mapped[field] = header.value.cells[i].trim();
    }
  }
  const hasName = index.company !== undefined || index.name !== undefined || index.firstName !== undefined || index.lastName !== undefined;
  if (!hasName) return null;

  const rows: ImportedCustomer[] = [];
  const skipped: CustomerImportResult["skipped"] = [];
  let line = 0;
  for (const rec of iter) {
    line++;
    if (line > IMPORT_MAX_ROWS) break;
    if (!rec.valid) { skipped.push({ line, reason: "malformed" }); continue; }
    const cell = (f: Field) => (index[f] === undefined ? "" : rec.cells[index[f]!] ?? "");
    const person = [cell("firstName"), cell("lastName")].map((s) => s.trim()).filter(Boolean).join(" ");
    const name = clean(cell("company"), 200) ?? clean(cell("name"), 200) ?? clean(person, 200);
    if (!name) { skipped.push({ line, reason: "no_name" }); continue; }
    const email = clean(cell("email"), 320)?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped.push({ line, reason: "invalid_email" }); continue; }
    const street = [cell("address"), cell("address2")].map((s) => s.trim()).filter(Boolean).join(" ");
    rows.push({
      name,
      email,
      address: clean(street, 300),
      postalCode: clean(cell("postalCode"), 20)?.toUpperCase() ?? null,
      city: clean(cell("city"), 120),
      country: countryCode(cell("country")),
      vatNumber: clean(cell("vatNumber").replace(/\s+/g, ""), 50)?.toUpperCase() ?? null,
    });
  }
  return { rows, skipped, mapped };
}

/** Sleutel om dubbele klanten te herkennen: e-mail, anders de naam. */
export function customerKey(c: { name: string; email: string | null }): string {
  return c.email ? `e:${c.email.toLowerCase()}` : `n:${norm(c.name)}`;
}
