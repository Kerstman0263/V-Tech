import { describe, it, expect } from "vitest";
import { ossSummary, dailyTotals, periodTotals, quarterRange, quarterOf, OSS_THRESHOLD_EUR } from "@/lib/webshop/oss";
import { parseOrderCsv, toCountryCode, toIsoDate } from "@/lib/webshop/csv";
import { mapShopifyOrder, mapWooOrder, mapBolOrder } from "@/lib/webshop/providers";
import { isPrivateIp, normalizeShopUrl, normalizeShopifyDomain } from "@/lib/webshop/safe-url";
import type { NormalizedOrder } from "@/lib/webshop/types";

const order = (o: Partial<NormalizedOrder>): NormalizedOrder => ({
  externalId: Math.random().toString(36),
  orderNumber: null,
  kind: "SALE",
  orderDate: "2026-03-10",
  country: "NL",
  currency: "EUR",
  totalGross: 121,
  vatAmount: 21,
  shippingGross: 0,
  fees: 0,
  isBusiness: false,
  ...o,
});

describe("OSS-drempel en btw per land", () => {
  it("telt alleen B2C-verkoop naar andere EU-landen mee voor de drempel", () => {
    const s = ossSummary([
      order({ country: "NL", totalGross: 50_000, vatAmount: 0 }), // binnenland
      order({ country: "DE", totalGross: 6_000, vatAmount: 0 }),
      order({ country: "BE", totalGross: 3_000, vatAmount: 0 }),
      order({ country: "FR", totalGross: 9_000, vatAmount: 0, isBusiness: true }), // B2B telt niet
      order({ country: "US", totalGross: 9_000, vatAmount: 0 }), // buiten EU
    ], 2026);
    expect(s.crossBorderNet).toBe(9_000);
    expect(s.thresholdExceeded).toBe(false);
    expect(s.threshold).toBe(OSS_THRESHOLD_EUR);
  });

  it("drempel gaat over het bedrag EXCL. btw en trekt retouren af", () => {
    const s = ossSummary([
      order({ country: "DE", totalGross: 11_900, vatAmount: 1_900 }), // net 10.000
      order({ country: "DE", totalGross: 119, vatAmount: 19, kind: "REFUND" }), // −100
      order({ country: "DE", totalGross: 238, vatAmount: 38 }), // +200
    ], 2026);
    expect(s.crossBorderNet).toBe(10_100);
    expect(s.thresholdExceeded).toBe(true);
  });

  it("waarschuwt als boven de drempel nog het NL-tarief wordt gerekend", () => {
    const s = ossSummary([
      order({ country: "DE", totalGross: 12_100, vatAmount: 2_100 }), // 21% i.p.v. 19%
      order({ country: "BE", totalGross: 1_210, vatAmount: 210 }), // BE is ook 21%: geen fout
    ], 2026);
    const de = s.perCountry.find((r) => r.country === "DE")!;
    const be = s.perCountry.find((r) => r.country === "BE")!;
    expect(de.effectiveRate).toBe(21);
    expect(de.standardRate).toBe(19);
    expect(de.rateMismatch).toBe(true);
    expect(be.rateMismatch).toBe(false);
  });

  it("de tabel volgt het gekozen kwartaal, de drempel het hele jaar", () => {
    const s = ossSummary([
      order({ country: "DE", orderDate: "2026-02-01", totalGross: 8_000, vatAmount: 0 }),
      order({ country: "DE", orderDate: "2026-08-01", totalGross: 3_000, vatAmount: 0 }),
      order({ country: "DE", orderDate: "2025-12-31", totalGross: 99_000, vatAmount: 0 }), // vorig jaar
    ], 2026, quarterRange(2026, 3));
    expect(s.crossBorderNet).toBe(11_000);
    expect(s.perCountry[0].net).toBe(3_000);
  });

  it("telt bestellingen zonder land apart", () => {
    const s = ossSummary([order({ country: null })], 2026);
    expect(s.unknownCountry).toBe(1);
  });
});

describe("dag- en periodetotalen", () => {
  it("bundelt per dag, retouren negatief, nieuwste eerst", () => {
    const days = dailyTotals([
      order({ orderDate: "2026-03-01", totalGross: 100, vatAmount: 17.36, fees: 2 }),
      order({ orderDate: "2026-03-01", totalGross: 50, vatAmount: 8.68 }),
      order({ orderDate: "2026-03-02", totalGross: 30, vatAmount: 5.21, kind: "REFUND" }),
    ]);
    expect(days[0]).toMatchObject({ date: "2026-03-02", orders: 0, refunds: 1, gross: -30 });
    expect(days[1]).toMatchObject({ date: "2026-03-01", orders: 2, gross: 150, vat: 26.04, fees: 2 });
  });

  it("periodetotalen rekenen netto = bruto − btw", () => {
    const t = periodTotals([order({ totalGross: 121, vatAmount: 21 }), order({ orderDate: "2026-05-01" })], "2026-01-01", "2026-04-01");
    expect(t).toMatchObject({ orders: 1, gross: 121, net: 100, vat: 21 });
  });

  it("kwartalen", () => {
    expect(quarterRange(2026, 4)).toEqual(["2026-10-01", "2027-01-01"]);
    expect(quarterOf("2026-05-31")).toBe(2);
  });
});

describe("CSV-import van orders", () => {
  it("leest een Shopify-export met productregels per order", () => {
    const csv = [
      "Name,Email,Financial Status,Paid at,Currency,Subtotal,Shipping,Taxes,Total,Created at,Lineitem name,Shipping Country,Refunded Amount",
      "#1001,a@x.nl,paid,2026-03-04 10:00:00 +0100,EUR,100.00,5.95,18.22,105.95,2026-03-04 09:58:00 +0100,Mok,NL,0.00",
      "#1001,,,,,,,,,,Bord,,",
      "#1002,b@x.de,refunded,2026-03-05 11:00:00 +0100,EUR,40.00,0.00,6.39,40.00,2026-03-05 10:59:00 +0100,Vaas,DE,40.00",
      "#1003,c@x.be,partially_refunded,2026-03-06 11:00:00 +0100,EUR,60.00,0.00,10.41,60.00,2026-03-06 10:59:00 +0100,Lamp,BE,20.00",
      "#1004,d@x.nl,pending,2026-03-07,EUR,10,0,1.74,10,2026-03-07,Kaars,NL,0",
    ].join("\n");
    const r = parseOrderCsv(csv, "shopify");
    expect(r.error).toBeUndefined();
    const ids = r.orders.map((o) => `${o.externalId}|${o.kind}|${o.totalGross}`);
    expect(ids).toEqual([
      "shopify:#1001|SALE|105.95",
      "shopify:#1002|REFUND|40",
      "shopify:#1003|SALE|60",
      "shopify:#1003:refund|REFUND|20",
    ]);
    expect(r.orders[0]).toMatchObject({ orderDate: "2026-03-04", country: "NL", vatAmount: 18.22, shippingGross: 5.95 });
    expect(r.orders[3].vatAmount).toBeCloseTo(3.47, 2);
    expect(r.skipped).toBe(1); // pending
  });

  it("leest een Nederlandse export met puntkomma's en landnamen", () => {
    const csv = "Bestelnummer;Datum;Totaal;BTW;Land;Kosten\nA-1;04-03-2026;€ 1.210,00;210,00;Duitsland;12,50\nA-2;05-03-2026;-60,50;10,50;België;0";
    const r = parseOrderCsv(csv, "eigen");
    expect(r.orders).toHaveLength(2);
    expect(r.orders[0]).toMatchObject({ orderDate: "2026-03-04", totalGross: 1210, vatAmount: 210, country: "DE", fees: 12.5, kind: "SALE" });
    expect(r.orders[1]).toMatchObject({ kind: "REFUND", totalGross: 60.5, country: "BE" });
  });

  it("geeft een duidelijke fout zonder datum- of totaalkolom", () => {
    expect(parseOrderCsv("foo,bar\n1,2").error).toBe("NO_COLUMNS");
    expect(parseOrderCsv("  ").error).toBe("EMPTY");
  });

  it("landen en datums", () => {
    expect(toCountryCode("nl")).toBe("NL");
    expect(toCountryCode("Germany")).toBe("DE");
    expect(toCountryCode("EL")).toBe("GR");
    expect(toCountryCode("Atlantis")).toBeNull();
    expect(toIsoDate("2026-02-30")).toBeNull();
    expect(toIsoDate("31/12/2026")).toBe("2026-12-31");
  });
});

describe("platformkoppelingen: omzetten naar Saldova-orders", () => {
  it("Shopify: verkoop + retour naar verhouding, geannuleerd overslaan", () => {
    const rows = mapShopifyOrder({
      id: "gid://shopify/Order/1",
      name: "#1001",
      createdAt: "2026-03-04T09:00:00Z",
      currencyCode: "EUR",
      totalPriceSet: { shopMoney: { amount: "121.00" } },
      totalTaxSet: { shopMoney: { amount: "21.00" } },
      totalShippingPriceSet: { shopMoney: { amount: "4.95" } },
      shippingAddress: { countryCodeV2: "DE" },
      refunds: [{ id: "r1", createdAt: "2026-03-10T09:00:00Z", totalRefundedSet: { shopMoney: { amount: "60.50" } } }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "SALE", country: "DE", totalGross: 121, vatAmount: 21, orderDate: "2026-03-04" });
    expect(rows[1]).toMatchObject({ kind: "REFUND", totalGross: 60.5, vatAmount: 10.5, orderDate: "2026-03-10" });
    expect(mapShopifyOrder({ id: "x", name: "x", createdAt: "2026-01-01T00:00:00Z", currencyCode: "EUR", cancelledAt: "2026-01-02T00:00:00Z" })).toEqual([]);
  });

  it("WooCommerce: negatieve retourbedragen, B2B herkennen", () => {
    const rows = mapWooOrder({
      id: 55, number: "55", status: "completed", currency: "EUR", date_created_gmt: "2026-04-01T08:00:00",
      total: "200.00", total_tax: "0.00", shipping_total: "0.00",
      billing: { country: "BE", company: "Bakkerij BV" }, shipping: { country: "BE" },
      refunds: [{ id: 9, total: "-50.00" }],
    });
    expect(rows[0]).toMatchObject({ isBusiness: true, country: "BE", orderDate: "2026-04-01" });
    expect(rows[1]).toMatchObject({ kind: "REFUND", totalGross: 50 });
    expect(mapWooOrder({ id: 1, status: "cancelled", currency: "EUR", total: "10", total_tax: "0" })).toEqual([]);
  });

  it("Bol.com: btw terugrekenen met het tarief van het afleverland", () => {
    const [o] = mapBolOrder({
      orderId: "B1", orderPlacedDateTime: "2026-05-01T12:00:00+02:00",
      shipmentDetails: { countryCode: "BE" },
      orderItems: [{ orderItemId: "i1", quantity: 2, unitPrice: 60.5 }, { orderItemId: "i2", quantity: 1, unitPrice: 10, quantityCancelled: 1 }],
    });
    expect(o).toMatchObject({ totalGross: 121, vatAmount: 21, country: "BE" });
  });
});

describe("beveiliging winkeladressen (SSRF)", () => {
  it("blokkeert interne IP-adressen", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("93.184.216.34")).toBe(false);
  });

  it("accepteert alleen https-domeinnamen", () => {
    expect(normalizeShopUrl("mijnwinkel.nl/").toString()).toBe("https://mijnwinkel.nl/");
    for (const bad of ["http://mijnwinkel.nl", "https://127.0.0.1", "https://localhost", "https://user:pw@shop.nl", "https://shop.nl:8080", "https://intranet"]) {
      expect(() => normalizeShopUrl(bad), bad).toThrow();
    }
  });

  it("Shopify alleen op *.myshopify.com", () => {
    expect(normalizeShopifyDomain("https://MijnWinkel.myshopify.com/admin")).toBe("mijnwinkel.myshopify.com");
    expect(normalizeShopifyDomain("mijnwinkel")).toBe("mijnwinkel.myshopify.com");
    expect(() => normalizeShopifyDomain("evil.com")).toThrow();
    expect(() => normalizeShopifyDomain("a.b.myshopify.com")).toThrow();
  });
});
