import { z } from "zod";

const secret = z.string().trim().min(8, "Deze sleutel is te kort.").max(300);

export const createConnectionSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("SHOPIFY"),
    shopUrl: z.string().trim().min(3).max(200),
    accessToken: secret,
  }),
  z.object({
    platform: z.literal("WOOCOMMERCE"),
    shopUrl: z.string().trim().min(4).max(200),
    consumerKey: secret,
    consumerSecret: secret,
  }),
  z.object({
    platform: z.literal("BOLCOM"),
    clientId: secret,
    clientSecret: secret,
  }),
]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().finite().min(0).max(10_000_000);

export const importOrdersSchema = z.object({
  /** Naam van de bron, bijv. "Etsy" of "Amazon". */
  source: z.string().trim().min(1).max(60),
  orders: z
    .array(
      z.object({
        externalId: z.string().min(1).max(190),
        orderNumber: z.string().max(100).nullable(),
        kind: z.enum(["SALE", "REFUND"]),
        orderDate: isoDate,
        country: z.string().regex(/^[A-Z]{2}$/).nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        totalGross: money,
        vatAmount: money,
        shippingGross: money,
        fees: money,
        isBusiness: z.boolean(),
      }),
    )
    .min(1)
    .max(5000),
});

export const overviewQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  quarter: z.coerce.number().int().min(0).max(4).default(0), // 0 = heel jaar
});
