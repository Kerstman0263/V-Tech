import { db } from "@/lib/db";
import type { ExportContext, ExportFile, ExportInvoice, ExportRow, ExportSource, ExportTableKey } from "@/lib/account-export";

/**
 * De Prisma-bron voor de volledige export (lib/account-export.ts).
 *
 * Elke query is beperkt tot één account (`accountId` uit de sessie) en leest
 * in pagina's, gesorteerd op id. Grote velden (bonnetjes, inbox-bijlagen,
 * handtekeningen, logo) komen alleen mee in de aparte bestandsquery's, en
 * geheimen worden hier al niet geselecteerd. De export haalt ze daarna voor de
 * zekerheid nog een keer weg (stripSecrets).
 */
export function prismaExportSource(accountId: string): ExportSource {
  const after = (cursor: string | null) => (cursor ? { id: { gt: cursor } } : {});
  // Bladeren op id: de cursor zit in `after` (id > cursor), hier alleen volgorde en paginagrootte.
  const page = (_cursor: string | null, take: number) => ({ orderBy: { id: "asc" as const }, take });
  const rows = <T extends object>(p: Promise<T[]>) => p as unknown as Promise<ExportRow[]>;
  const own = { userId: accountId };

  const tables: Record<ExportTableKey, (cursor: string | null, take: number) => Promise<ExportRow[]>> = {
    company: (c, take) => rows(db.company.findMany({ where: { ...own, ...after(c) }, omit: { logo: true }, ...page(c, take) })),
    // Alleen veilige velden: geen wachtwoordhash, 2FA-geheim/back-upcodes of inbox-token.
    team: (c, take) => rows(db.user.findMany({
      where: { AND: [{ OR: [{ id: accountId }, { ownerId: accountId }] }, after(c)] },
      select: {
        id: true, email: true, name: true, locale: true, ownerId: true, teamRole: true,
        permissions: true, permissionsCustom: true, hourlyCost: true, totpEnabled: true,
        emailVerifiedAt: true, createdAt: true, updatedAt: true,
      },
      ...page(c, take),
    })),
    invoiceSettings: (c, take) => rows(db.invoiceSettings.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    subscription: (c, take) => rows(db.subscription.findMany({
      where: { ...own, ...after(c) },
      select: { id: true, plan: true, status: true, currentPeriodEnd: true, canceledAt: true, trialEndsAt: true, createdAt: true, updatedAt: true },
      ...page(c, take),
    })),
    consents: (c, take) => rows(db.consent.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    customers: (c, take) => rows(db.customer.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    projects: (c, take) => rows(db.project.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    invoices: (c, take) => rows(db.invoice.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    invoiceLines: (c, take) => rows(db.invoiceLineItem.findMany({ where: { invoice: own, ...after(c) }, ...page(c, take) })),
    invoicePayments: (c, take) => rows(db.invoicePayment.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    quotes: (c, take) => rows(db.quote.findMany({ where: { ...own, ...after(c) }, omit: { publicToken: true, signatureData: true }, ...page(c, take) })),
    quoteLines: (c, take) => rows(db.quoteLineItem.findMany({ where: { quote: own, ...after(c) }, ...page(c, take) })),
    recurringInvoices: (c, take) => rows(db.recurringInvoice.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    products: (c, take) => rows(db.product.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    timeEntries: (c, take) => rows(db.timeEntry.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    mileage: (c, take) => rows(db.mileageEntry.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    expenses: (c, take) => rows(db.expense.findMany({ where: { ...own, ...after(c) }, omit: { receipt: true }, ...page(c, take) })),
    inbox: (c, take) => rows(db.inboxItem.findMany({ where: { ...own, ...after(c) }, omit: { data: true }, ...page(c, take) })),
    bankTransactions: (c, take) => rows(db.bankTransaction.findMany({ where: { ...own, ...after(c) }, omit: { dedupeHash: true }, ...page(c, take) })),
    assets: (c, take) => rows(db.asset.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    leaveRequests: (c, take) => rows(db.leaveRequest.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    leaveBalances: (c, take) => rows(db.leaveBalance.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    tasks: (c, take) => rows(db.task.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    // Sleutels (credentials) gaan nooit mee.
    webshopConnections: (c, take) => rows(db.webshopConnection.findMany({ where: { ...own, ...after(c) }, omit: { credentials: true }, ...page(c, take) })),
    webshopOrders: (c, take) => rows(db.webshopOrder.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
    activity: (c, take) => rows(db.auditLog.findMany({ where: { accountId, platform: false, ...after(c) }, omit: { platform: true }, ...page(c, take) })),
    support: (c, take) => rows(db.supportMessage.findMany({ where: { ...own, ...after(c) }, ...page(c, take) })),
  };

  return {
    rows: (table, cursor, take) => tables[table](cursor, take),

    async files(kind, cursor, take): Promise<ExportFile[]> {
      if (kind === "receipt") {
        const list = await db.expense.findMany({
          where: { ...own, receipt: { not: null }, ...after(cursor) },
          select: { id: true, date: true, vendor: true, receipt: true },
          ...page(cursor, take),
        });
        return list.map((e) => ({ id: e.id, dataUrl: e.receipt ?? "", label: `${e.date.toISOString().slice(0, 10)} ${e.vendor}` }));
      }
      if (kind === "inbox") {
        const list = await db.inboxItem.findMany({
          where: { ...own, ...after(cursor) },
          select: { id: true, fileName: true, mimeType: true, data: true, receivedAt: true },
          ...page(cursor, take),
        });
        return list.map((i) => ({ id: i.id, dataUrl: i.data, fileName: i.fileName, mimeType: i.mimeType, label: `${i.receivedAt.toISOString().slice(0, 10)} bijlage` }));
      }
      const list = await db.quote.findMany({
        where: { ...own, signatureData: { not: null }, ...after(cursor) },
        select: { id: true, quoteNumber: true, signatureData: true },
        ...page(cursor, take),
      });
      return list.map((q) => ({ id: q.id, dataUrl: q.signatureData ?? "", label: `handtekening ${q.quoteNumber}` }));
    },

    async invoices(cursor, take): Promise<ExportInvoice[]> {
      return db.invoice.findMany({
        where: { ...own, status: { not: "DRAFT" }, ...after(cursor) },
        include: { customer: true, lineItems: { orderBy: { position: "asc" } } },
        ...page(cursor, take),
      });
    },

    async context(): Promise<ExportContext> {
      const [owner, company, settings] = await Promise.all([
        db.user.findUnique({ where: { id: accountId }, select: { email: true } }),
        db.company.findUnique({ where: { userId: accountId } }),
        db.invoiceSettings.findUnique({ where: { userId: accountId } }),
      ]);
      return {
        ownerEmail: owner?.email ?? "",
        company,
        settings: settings
          ? { accentColor: settings.accentColor, paymentTerms: settings.paymentTerms, footerText: settings.footerText, korEnabled: settings.korEnabled }
          : null,
      };
    },
  };
}
