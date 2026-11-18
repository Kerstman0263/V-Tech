import { describe, it, expect } from "vitest";
import { OVA_BUNDLES, OVA_BUNDLE_EXAMPLE, OVA_BUNDLE_RULES, OVA_PRODUCTS, euro } from "@/lib/ova";
import { PLANS } from "@/lib/plans";
import nl from "@/messages/nl.json";
import en from "@/messages/en.json";

// Zelfde volgorde als OVA_RULE_KEYS in components/landing/OvaBundles.tsx (dat bestand is TSX en
// wordt hier bewust niet geïmporteerd).
const RULE_KEYS = ["counts", "wardova", "discount", "payment"] as const;

describe("Ova-rekenvoorbeeld", () => {
  it("de regels tellen op tot het subtotaal", () => {
    const sum = OVA_BUNDLE_EXAMPLE.lines.reduce((total, line) => total + line.amount, 0);
    expect(sum).toBe(OVA_BUNDLE_EXAMPLE.subtotal);
    expect(sum).toBe(113);
  });

  it("subtotaal min korting is het totaal", () => {
    expect(OVA_BUNDLE_EXAMPLE.subtotal - OVA_BUNDLE_EXAMPLE.discount).toBe(OVA_BUNDLE_EXAMPLE.total);
    expect(OVA_BUNDLE_EXAMPLE.total).toBe(98);
  });

  it("het voorbeeld gebruikt de korting van Ova Compleet en de echte prijzen", () => {
    const compleet = OVA_BUNDLES.find((bundle) => bundle.key === "compleet");
    expect(OVA_BUNDLE_EXAMPLE.discount).toBe(compleet?.discount);
    const amount = (key: string) => OVA_BUNDLE_EXAMPLE.lines.find((line) => line.key === key)?.amount;
    expect(amount("cloudova")).toBe(5 * 15); // 5 pagina's à € 15
    expect(amount("saldova")).toBe(PLANS.PRO.price); // Saldova Pro
    expect(amount("wardova")).toBe(9); // 1 domein Wardova Pro
  });
});

describe("Ova-bundels", () => {
  it("Duo € 5 en Compleet € 15 korting per maand", () => {
    expect(OVA_BUNDLES.map((bundle) => [bundle.key, bundle.products, bundle.discount])).toEqual([
      ["duo", 2, 5],
      ["compleet", 3, 15],
    ]);
  });

  it("de drie producten met de juiste adressen", () => {
    expect(OVA_PRODUCTS.map((product) => product.url)).toEqual([
      "https://cloudova.vercel.app",
      "https://wardova.vercel.app",
      "https://saldova.vercel.app",
    ]);
  });

  it("de Saldova-prijsregel klopt met het goedkoopste betaalde plan", () => {
    expect(PLANS.GROWTH.price).toBe(15);
    expect(OVA_PRODUCTS.find((product) => product.key === "saldova")?.price).toContain("€ 15");
  });

  it("euro() schrijft bedragen op zijn Nederlands", () => {
    expect(euro(15)).toBe("€ 15");
    expect(euro(1250)).toBe("€ 1.250");
  });
});

describe("Ova-teksten in messages", () => {
  it("nl.json zegt hetzelfde als lib/ova.ts", () => {
    expect(RULE_KEYS.map((key) => nl.ova.rules[key])).toEqual([...OVA_BUNDLE_RULES]);
    for (const line of OVA_BUNDLE_EXAMPLE.lines) expect(nl.ova.example.lines[line.key]).toBe(line.label);
    for (const bundle of OVA_BUNDLES) {
      expect(nl.ova.bundles[bundle.key].name).toBe(bundle.name);
      expect(nl.ova.bundles[bundle.key].summary).toBe(bundle.summary);
    }
    for (const product of OVA_PRODUCTS) {
      expect(nl.ova.products[product.key].what).toBe(product.what);
      expect(nl.ova.products[product.key].price).toBe(product.price);
    }
  });

  it("en.json heeft dezelfde sleutels als nl.json", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix];
    expect(keys(en.ova).sort()).toEqual(keys(nl.ova).sort());
  });
});
