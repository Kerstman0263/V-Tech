import { db } from "@/lib/db";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { createInvoiceInTransaction, type CreateInvoiceOptions } from "@/lib/invoice-write";
export type CreateInvoiceLine = CreateInvoiceOptions["lineItems"][number];

/** Shared, atomic invoice creation for forms, credits, quotes and recurring work. */
export async function createInvoiceForAccount(opts: CreateInvoiceOptions) {
  await getOrCreateInvoiceSettings(opts.accountId);
  return db.$transaction((tx) => createInvoiceInTransaction(tx, opts));
}
