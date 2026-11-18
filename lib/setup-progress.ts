import { db } from "@/lib/db";

export async function setupProgress(accountId: string) {
  const [company, customers, invoices] = await Promise.all([
    db.company.findUnique({ where: { userId: accountId }, select: { name: true } }),
    db.customer.count({ where: { userId: accountId } }),
    db.invoice.count({ where: { userId: accountId } }),
  ]);
  return [Boolean(company?.name?.trim()), customers > 0, invoices > 0];
}
