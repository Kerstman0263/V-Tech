import { db } from "@/lib/db";
import { mollie, cancelRecurringSubscription } from "@/lib/mollie";
import { HttpError } from "@/lib/http-error";
import { logPlatform } from "@/lib/audit";

/**
 * Betalingen stopzetten vóórdat een account wordt verwijderd.
 *
 * Verwijderen wist de abonnementsrij (met de Mollie-id's) via de cascade. Loopt
 * het abonnement bij Mollie dan nog, dan blijft Mollie incasseren voor een
 * account dat niet meer bestaat. Daarom eerst:
 *  1. het gekoppelde abonnement opzeggen (bestaande helper in lib/mollie.ts),
 *  2. elk ander lopend abonnement van dezelfde Mollie-klant opzeggen,
 *  3. de mandaten intrekken (zonder mandaat kan er niet worden geïncasseerd),
 *  4. de klant bij Mollie verwijderen.
 *
 * Mislukt stap 1 t/m 3, dan gooien we BillingCloseError en wordt het account
 * NIET verwijderd. Was er toen al iets opgezegd of ingetrokken, dan heeft de
 * fout de code billing_cancel_partial: de melding zegt dan eerlijk dat het
 * abonnement al wel is opgezegd. Stap 4 is een opruimstap: na 1 t/m 3 kan er niets meer
 * worden afgeschreven, dus een mislukte verwijdering van de klant meldt het
 * logboek wel, maar houdt het verwijderen niet tegen.
 *
 * Zonder abonnement, zonder Mollie-klant of zonder Mollie-sleutel is er niets
 * op te zeggen: dan gaat het verwijderen gewoon door.
 */

const LIVE_SUBSCRIPTION = new Set(["pending", "active", "suspended"]);
const LIVE_MANDATE = new Set(["pending", "valid"]);
/** Bovengrens per lijst, zodat een vreemde Mollie-klant geen eindeloze lus wordt. */
const MAX_LISTED = 250;

export const BILLING_CLOSE_FAILED_MESSAGE =
  "Je account is niet verwijderd. We konden je abonnement bij Mollie niet opzeggen, en dan zou Mollie blijven afschrijven. Probeer het over een paar minuten opnieuw. Lukt het dan nog niet, neem dan contact met ons op.";

export const ADMIN_BILLING_CLOSE_FAILED_MESSAGE =
  "Het account is niet verwijderd: het abonnement bij Mollie kon niet worden opgezegd. Zeg het abonnement eerst op in het Mollie-dashboard (zie het platformlog voor de Mollie-klant) en probeer het daarna opnieuw.";

/** Een deel is al gelukt (abonnement opgezegd of mandaat ingetrokken), de rest niet. */
export const BILLING_CLOSE_PARTIAL_MESSAGE =
  "Je account is niet verwijderd. Je abonnement bij Mollie is wel al opgezegd, maar we konden niet alle betalingen bij Mollie stopzetten. Probeer het over een paar minuten opnieuw. Lukt het dan nog niet, neem dan contact met ons op.";

export const ADMIN_BILLING_CLOSE_PARTIAL_MESSAGE =
  "Het account is niet verwijderd. Bij Mollie is al een deel opgezegd of ingetrokken (zie het platformlog), maar niet alles. Rond het af in het Mollie-dashboard en probeer het daarna opnieuw.";

/** Wat er bij Mollie al was gelukt toen het misging. */
export interface PartialClosure {
  canceledSubscriptions: string[];
  revokedMandates: string[];
}

export class BillingCloseError extends HttpError {
  /** billing_cancel_partial: er is al iets opgezegd, maar niet alles. */
  readonly code: "billing_cancel_failed" | "billing_cancel_partial";
  constructor(
    public readonly customerId: string | null,
    message: string = BILLING_CLOSE_FAILED_MESSAGE,
    public readonly partial: PartialClosure = { canceledSubscriptions: [], revokedMandates: [] },
  ) {
    super(502, message);
    this.code = isPartial(partial) ? "billing_cancel_partial" : "billing_cancel_failed";
  }
}

function isPartial(p: PartialClosure): boolean {
  return p.canceledSubscriptions.length > 0 || p.revokedMandates.length > 0;
}

export interface BillingClosure {
  /** Mollie-klant van het account (null = er was er geen). */
  customerId: string | null;
  /** Abonnementen die nu bij Mollie zijn opgezegd. */
  canceledSubscriptions: string[];
  /** Mandaten die nu zijn ingetrokken. */
  revokedMandates: string[];
  /** Is de klant bij Mollie verwijderd (of bestond die al niet meer)? */
  customerDeleted: boolean;
  /** Waarom er niets bij Mollie is gedaan, of null als dat wel is gebeurd. */
  skipped: "no_subscription" | "no_customer" | "no_api_key" | null;
}

/** 404/410 bij Mollie: het object bestaat niet (meer), dus kan het ook niet incasseren. */
function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  return status === 404 || status === 410;
}

async function unlessGone<T>(work: Promise<T>): Promise<T | "gone"> {
  try {
    return await work;
  } catch (err) {
    if (isGone(err)) return "gone";
    throw err;
  }
}

/** Zet alle betalingen van dit account bij Mollie stop. Gooit BillingCloseError als dat niet lukt. */
export async function closeMollieBilling(userId: string): Promise<BillingClosure> {
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { mollieCustomerId: true, mollieSubscriptionId: true },
  });
  const result: BillingClosure = {
    customerId: sub?.mollieCustomerId ?? null,
    canceledSubscriptions: [],
    revokedMandates: [],
    customerDeleted: false,
    skipped: null,
  };
  if (!sub) return { ...result, skipped: "no_subscription" };
  const customerId = sub.mollieCustomerId;
  // Zonder Mollie-klant is er nooit een mandaat of incasso geweest.
  if (!customerId) return { ...result, skipped: "no_customer" };
  if (!process.env.MOLLIE_API_KEY) return { ...result, skipped: "no_api_key" };

  const client = mollie();
  try {
    // 1. Het gekoppelde abonnement, via de bestaande helper.
    const linkedId = sub.mollieSubscriptionId;
    if (linkedId) {
      try {
        await cancelRecurringSubscription(userId);
        result.canceledSubscriptions.push(linkedId);
      } catch (err) {
        // Al opgezegd of niet meer bij Mollie? Dan is er niets meer op te zeggen.
        const current = await unlessGone(client.customerSubscriptions.get(linkedId, { customerId }));
        if (current !== "gone" && LIVE_SUBSCRIPTION.has(current.status)) throw err;
      }
    }

    // 2. Elk ander lopend abonnement van deze klant (oud of dubbel).
    let listed = 0;
    const subscriptions = await unlessGone(
      (async () => {
        for await (const s of client.customerSubscriptions.iterate({ customerId, valuesPerMinute: 10_000 })) {
          if (++listed > MAX_LISTED) throw new Error("Too many subscriptions to review");
          if (!LIVE_SUBSCRIPTION.has(s.status) || result.canceledSubscriptions.includes(s.id)) continue;
          await unlessGone(client.customerSubscriptions.cancel(s.id, { customerId }));
          result.canceledSubscriptions.push(s.id);
        }
      })(),
    );

    // 3. Mandaten intrekken. Bestaat de klant niet meer (stap 2 gaf 404), dan ook geen mandaten.
    if (subscriptions !== "gone") {
      listed = 0;
      await unlessGone(
        (async () => {
          for await (const m of client.customerMandates.iterate({ customerId, valuesPerMinute: 10_000 })) {
            if (++listed > MAX_LISTED) throw new Error("Too many mandates to review");
            if (!LIVE_MANDATE.has(m.status)) continue;
            await unlessGone(client.customerMandates.revoke(m.id, { customerId }));
            result.revokedMandates.push(m.id);
          }
        })(),
      );
    } else {
      result.customerDeleted = true;
      return result;
    }
  } catch (err) {
    console.error("[billing] mollie_close_failed", { type: err instanceof Error ? err.name : "UnknownError" });
    const partial = { canceledSubscriptions: [...result.canceledSubscriptions], revokedMandates: [...result.revokedMandates] };
    throw new BillingCloseError(customerId, isPartial(partial) ? BILLING_CLOSE_PARTIAL_MESSAGE : BILLING_CLOSE_FAILED_MESSAGE, partial);
  }

  // 4. Opruimen: de klant zelf bij Mollie verwijderen.
  try {
    await unlessGone(client.customers.delete(customerId));
    result.customerDeleted = true;
  } catch (err) {
    console.warn("[billing] mollie_customer_delete_failed", { type: err instanceof Error ? err.name : "UnknownError" });
  }
  return result;
}

interface Actor {
  id?: string | null;
  name?: string | null;
  email?: string | null;
}

/** Leesbare regel voor het platformlog, met de Mollie-id's (geen geheimen). */
export function describeClosure(label: string, c: BillingClosure): string {
  if (c.skipped === "no_subscription" || c.skipped === "no_customer") return `${label}: geen Mollie-klant, niets op te zeggen`;
  if (c.skipped === "no_api_key") return `${label}: Mollie-klant ${c.customerId}, NIET opgezegd (geen Mollie-sleutel ingesteld) - controleer in Mollie`;
  const subs = c.canceledSubscriptions.length ? c.canceledSubscriptions.join(", ") : "geen lopend";
  const mandates = c.revokedMandates.length ? c.revokedMandates.join(", ") : "geen geldig";
  return `${label}: Mollie-klant ${c.customerId}, abonnement ${subs} opgezegd, mandaat ${mandates} ingetrokken, klant ${c.customerDeleted ? "verwijderd" : "NIET verwijderd"}`;
}

/** Leesbare regel voor het platformlog bij een mislukte opzegging, met wat al wel gelukt was. */
export function describeFailedClosure(label: string, err: BillingCloseError): string {
  const done = isPartial(err.partial)
    ? `al gedaan: abonnement ${err.partial.canceledSubscriptions.join(", ") || "geen"} opgezegd, mandaat ${err.partial.revokedMandates.join(", ") || "geen"} ingetrokken; de rest mislukt`
    : "opzeggen mislukt";
  return `${label}: Mollie-klant ${err.customerId ?? "-"}, ${done}, account niet verwijderd`;
}

/** Meldingen voor de gebruiker: als alles mislukte, en als een deel al gelukt was. */
export interface FailureMessages {
  failed: string;
  partial: string;
}

const SELF_MESSAGES: FailureMessages = { failed: BILLING_CLOSE_FAILED_MESSAGE, partial: BILLING_CLOSE_PARTIAL_MESSAGE };
export const ADMIN_FAILURE_MESSAGES: FailureMessages = { failed: ADMIN_BILLING_CLOSE_FAILED_MESSAGE, partial: ADMIN_BILLING_CLOSE_PARTIAL_MESSAGE };

/**
 * Voor beide verwijderroutes: betalingen stopzetten en het resultaat (met het
 * Mollie-id) in het platformlog zetten. Gooit BillingCloseError bij een mislukte
 * opzegging; dan mag het account niet worden verwijderd. Was een deel al gelukt
 * (bijv. het abonnement wel opgezegd, een mandaat niet ingetrokken), dan zegt
 * de melding dat eerlijk en staat het gedeeltelijke resultaat in het log.
 */
export async function closeBillingBeforeDelete(
  userId: string,
  actor: Actor,
  label: string,
  messages: FailureMessages = SELF_MESSAGES,
): Promise<BillingClosure> {
  try {
    const closure = await closeMollieBilling(userId);
    if (closure.customerId) logPlatform(actor, "account.billing_closed", describeClosure(label, closure));
    return closure;
  } catch (err) {
    if (err instanceof BillingCloseError) {
      logPlatform(actor, "account.billing_close_failed", describeFailedClosure(label, err));
      throw new BillingCloseError(err.customerId, isPartial(err.partial) ? messages.partial : messages.failed, err.partial);
    }
    throw err;
  }
}
