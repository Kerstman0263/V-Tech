import { db } from "@/lib/db";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { InvoiceRuleError } from "@/lib/invoice-rule-error";
import { sendInvoiceEmail } from "@/lib/invoice-send";
import { recurringLineItemsSchema, type RecurringInterval } from "@/lib/validations/recurring";
import { planHasRecurringInvoices } from "@/lib/plans";
import { accessState, effectivePlan } from "@/lib/subscription";
import type { AccountType, Plan, Prisma, SubStatus } from "@prisma/client";

export type RecurringAccessCode = "expired" | "plan";

/** Waarom dit account geen periodieke facturen (meer) kan laten maken, of null. Puur. */
export function recurringAccessCode(
  account: { plan: Plan; status: SubStatus; trialEndsAt: Date | null; accountType: AccountType },
  now: Date = new Date(),
): RecurringAccessCode | null {
  if (accessState(account, account.accountType, now) === "expired") return "expired";
  // Effectief plan: tijdens een Groei-proef mag het, daarna (Gratis) niet meer.
  if (!planHasRecurringInvoices(effectivePlan(account, account.accountType, now))) return "plan";
  return null;
}

const ACCESS_MESSAGES: Record<RecurringAccessCode, string> = {
  expired: "Je abonnement of proefperiode is verlopen. Kies een abonnement om periodieke facturen weer te laten draaien.",
  plan: "Periodieke facturen zitten in de betaalde abonnementen (vanaf Groei).",
};

/**
 * Mag dit account (nog) periodieke facturen laten maken? Geeft de reden terug
 * als het niet mag, anders null. Puur, zodat het los te testen is.
 */
export function recurringAccessProblem(
  account: { plan: Plan; status: SubStatus; trialEndsAt: Date | null; accountType: AccountType },
  now: Date = new Date(),
): string | null {
  const code = recurringAccessCode(account, now);
  return code ? ACCESS_MESSAGES[code] : null;
}

/** Abonnement + accounttype van een account, met dezelfde standaarden als overal. */
export async function recurringAccessFor(client: Pick<Prisma.TransactionClient, "subscription" | "company">, accountId: string, now: Date = new Date()): Promise<RecurringAccessCode | null> {
  const [sub, company] = await Promise.all([
    client.subscription.findUnique({ where: { userId: accountId }, select: { plan: true, status: true, trialEndsAt: true } }),
    client.company.findUnique({ where: { userId: accountId }, select: { accountType: true } }),
  ]);
  return recurringAccessCode({
    plan: sub?.plan ?? "FREE", status: sub?.status ?? "TRIALING", trialEndsAt: sub?.trialEndsAt ?? null,
    accountType: company?.accountType ?? "ZZP",
  }, now);
}

/** Leest abonnement + accounttype en gooit 402 als periodiek factureren niet mag. */
export async function assertRecurringAllowed(client: Pick<Prisma.TransactionClient, "subscription" | "company">, accountId: string, now: Date = new Date()) {
  const code = await recurringAccessFor(client, accountId, now);
  if (code) throw new HttpError(402, ACCESS_MESSAGES[code]);
}

/**
 * Volgende factuurdatum na `from`. Maandelijks/kwartaal/jaar houdt de dag
 * van de maand vast en klemt op maandeinde (31 jan -> 28 feb).
 */
export function nextRunAfter(from: Date, interval: RecurringInterval): Date {
  const d = new Date(from);
  if (interval === "WEEKLY") {
    d.setDate(d.getDate() + 7);
    return d;
  }
  const months = interval === "MONTHLY" ? 1 : interval === "QUARTERLY" ? 3 : 12;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInTarget));
  return d;
}

/** Claim a schedule and create its invoice in one database transaction. */
export async function createRecurringRun(id: string, accountId: string, expectedRun: Date, now: Date, actorId: string | null) {
  await getOrCreateInvoiceSettings(accountId);
  return serializableTransaction(async (tx) => {
    const rec = await tx.recurringInvoice.findFirst({ where: { id, userId: accountId } });
    if (!rec) throw new HttpError(404, "Periodieke factuur niet gevonden.");
    await assertRecurringAllowed(tx, accountId, now);
    if (rec.nextRunAt.getTime() !== expectedRun.getTime()) return null;
    const parsed = recurringLineItemsSchema.safeParse(rec.lineItems);
    if (!parsed.success) throw new HttpError(422, "Controleer de regels van de periodieke factuur.");
    let next = nextRunAfter(rec.nextRunAt, rec.interval);
    while (next <= now) next = nextRunAfter(next, rec.interval);
    const claimed = await tx.recurringInvoice.updateMany({
      where: { id, userId: accountId, nextRunAt: expectedRun },
      data: { nextRunAt: next, lastRunAt: now, runCount: { increment: 1 } },
    });
    if (!claimed.count) return null;
    const invoice = await createInvoiceInTransaction(tx, {
      accountId, createdById: actorId, customerId: rec.customerId,
      lineItems: parsed.data, notes: rec.notes, issueDate: now,
    });
    await tx.auditLog.create({ data: {
      accountId, actorId, actorName: actorId ? "Accountgebruiker" : "Saldova (automatisch)",
      action: "invoice.recurring_created", target: invoice.invoiceNumber,
    } });
    return { invoice, autoSend: rec.autoSend };
  });
}

/**
 * One invoice per due schedule; failed mail leaves that invoice available.
 *
 * Accounts zonder toegang (verlopen abonnement of plan zonder periodieke
 * facturen): hun verlopen schema's worden gepauzeerd (active = false), met een
 * regel in Activiteit en een melding op /recurring. Zo blijven ze niet eeuwig
 * "aan de beurt" en verdringen ze geen schema's van andere accounts. Na een
 * upgrade zet de eigenaar ze met "Hervatten" weer aan.
 *
 * Botst een sjabloon met de btw- of KOR-regels (lib/kor.ts, lib/vat-scheme.ts),
 * dan wordt dat schema gepauzeerd met de reden in Activiteit.
 *
 * Kan een factuur niet gemaild worden omdat de afzendergegevens ontbreken,
 * dan blijft hij als concept staan en komt er een regel in Activiteit.
 */
export async function runDueRecurringInvoices(now: Date = new Date()): Promise<{ created: number; sent: number; failed: number; skipped: number }> {
  const due = await db.recurringInvoice.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: 500,
  });
  let created = 0, sent = 0, failed = 0, skipped = 0;
  const blocked = new Map<string, boolean>();
  for (const rec of due) {
    try {
      if (!blocked.has(rec.userId)) {
        const code = await recurringAccessFor(db, rec.userId, now);
        blocked.set(rec.userId, code !== null);
        if (code) {
          const paused = await db.recurringInvoice.updateMany({
            where: { userId: rec.userId, active: true, nextRunAt: { lte: now } },
            data: { active: false },
          });
          if (paused.count > 0) {
            await db.auditLog.create({ data: {
              accountId: rec.userId, actorId: null, actorName: "Saldova (automatisch)",
              action: code === "plan" ? "invoice.recurring_paused_plan" : "invoice.recurring_paused_expired", target: null,
            } });
          }
          console.info("recurring_invoice_paused", { accountId: rec.userId, reason: code, count: paused.count });
        }
      }
      if (blocked.get(rec.userId)) {
        skipped++;
        continue;
      }
      const run = await createRecurringRun(rec.id, rec.userId, rec.nextRunAt, now, null);
      if (!run) continue;
      created++;
      if (run.autoSend) {
        const result = await sendInvoiceEmail(run.invoice.id, rec.userId);
        if (result === "sent") sent++;
        else {
          failed++;
          if (result === "sender_details_missing") {
            await db.auditLog.create({ data: {
              accountId: rec.userId, actorId: null, actorName: "Saldova (automatisch)",
              action: "invoice.send_blocked_sender", target: run.invoice.invoiceNumber,
            } });
          }
        }
      }
    } catch (error) {
      console.error("recurring_invoice_failed", { type: error instanceof Error ? error.name : "UnknownError" });
      failed++;
      // Btw- of KOR-regel (bijv. de KOR staat aan maar het sjabloon heeft 21% btw):
      // dit schema pauzeren, zodat het niet elke dag opnieuw faalt, en in
      // Activiteit melden waarom. Na aanpassen zet de eigenaar het weer aan.
      if (error instanceof InvoiceRuleError) {
        try {
          await db.recurringInvoice.updateMany({ where: { id: rec.id, userId: rec.userId, active: true }, data: { active: false } });
          await db.auditLog.create({ data: {
            accountId: rec.userId, actorId: null, actorName: "Saldova (automatisch)",
            action: "invoice.recurring_paused_rules", target: error.message.slice(0, 300),
          } });
        } catch {
          /* pauzeren mislukt: volgende run probeert het opnieuw */
        }
      }
    }
  }
  return { created, sent, failed, skipped };
}
