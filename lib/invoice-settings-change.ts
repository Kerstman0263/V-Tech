import { extractIban, normalizeIban } from "@/lib/iban";
import { formatInvoiceNumber } from "@/lib/invoice-status";

/**
 * Regels voor het wijzigen van de factuurinstellingen. Puur, zodat ze los te testen zijn.
 *
 * - Betaalgegevens (IBAN en tenaamstelling), KOR, huisstijlkleur en voettekst
 *   staan op elke factuur. Die wijzigt alleen de eigenaar van het account, niet
 *   een boekhouder of teamlid met facturatierecht.
 * - De nummering moet doorlopend blijven. Binnen een reeks mag het volgende
 *   nummer niet terug, alleen een klein stukje omhoog, en blijft de opvulling
 *   gelijk. Een grote sprong, terugzetten of een andere opvulling kan alleen
 *   bij een nieuwe reeks: een voorvoegsel dat nog op geen enkele factuur staat
 *   (of als er nog helemaal geen facturen zijn).
 */
export const OWNER_ONLY_SETTINGS = ["paymentTerms", "korEnabled", "accentColor", "footerText"] as const;
export type OwnerOnlySetting = (typeof OWNER_ONLY_SETTINGS)[number];

/** Zoveel mag het volgende factuurnummer binnen een reeks in één keer omhoog. */
export const MAX_NUMBER_SKIP = 10;
/** Bovengrens van het volgnummer (past ruim in de database en in elke opvulling). */
export const MAX_INVOICE_SEQUENCE = 99_999_999;

const same = (a: unknown, b: unknown) => (a ?? "") === (b ?? "");

/** Welke alleen-eigenaar-velden wijzigen echt (meesturen met dezelfde waarde telt niet)? */
export function changedOwnerOnlySettings(input: Partial<Record<OwnerOnlySetting, unknown>>, current: Partial<Record<OwnerOnlySetting, unknown>>): OwnerOnlySetting[] {
  return OWNER_ONLY_SETTINGS.filter((key) => input[key] !== undefined && !same(input[key], current[key]));
}

export interface Numbering {
  invoicePrefix: string;
  nextNumber: number;
  numberPadding: number;
}

export interface NumberingChangeInput {
  current: Numbering;
  next: Partial<Numbering>;
  /** Heeft dit account al facturen? */
  hasInvoices: boolean;
  /** Staat het nieuwe voorvoegsel al op een factuur? (alleen nodig als het verandert) */
  prefixInUse: boolean;
}

export interface NumberingChange {
  changed: boolean;
  result: Numbering;
  problem: string | null;
}

export function numberingChange({ current, next, hasInvoices, prefixInUse }: NumberingChangeInput): NumberingChange {
  const result: Numbering = {
    invoicePrefix: next.invoicePrefix ?? current.invoicePrefix,
    nextNumber: next.nextNumber ?? current.nextNumber,
    numberPadding: next.numberPadding ?? current.numberPadding,
  };
  const changed = result.invoicePrefix !== current.invoicePrefix || result.nextNumber !== current.nextNumber || result.numberPadding !== current.numberPadding;
  const done = (problem: string | null): NumberingChange => ({ changed, result, problem });
  if (!changed) return done(null);
  if (!Number.isInteger(result.nextNumber) || result.nextNumber < 1 || result.nextNumber > MAX_INVOICE_SEQUENCE) {
    return done(`Het volgende factuurnummer moet tussen 1 en ${MAX_INVOICE_SEQUENCE.toLocaleString("nl-NL")} liggen.`);
  }
  // Nog geen facturen: alles mag (bijvoorbeeld doornummeren vanuit je oude pakket).
  if (!hasInvoices) return done(null);
  const prefixChanged = result.invoicePrefix !== current.invoicePrefix;
  if (prefixChanged) {
    // Nieuwe reeks: elk beginnummer en elke opvulling, want er kan niets botsen.
    if (!prefixInUse) return done(null);
    return done("Dit voorvoegsel staat al op een factuur. Kies voor een nieuwe reeks een voorvoegsel dat je nog niet hebt gebruikt, bijvoorbeeld het nieuwe jaar.");
  }
  if (result.numberPadding !== current.numberPadding) {
    return done("Het aantal cijfers kun je alleen wijzigen bij een nieuwe reeks. Kies dan ook een nieuw voorvoegsel, bijvoorbeeld het nieuwe jaar.");
  }
  if (result.nextNumber < current.nextNumber) {
    return done(`Het volgende factuurnummer kan alleen omhoog (minimaal ${current.nextNumber}). Terugzetten breekt de doorlopende nummering.`);
  }
  if (result.nextNumber - current.nextNumber > MAX_NUMBER_SKIP) {
    return done(`Zo'n grote sprong geeft een gat in je nummering. Binnen een reeks kan het nummer maximaal ${MAX_NUMBER_SKIP} omhoog. Wil je opnieuw beginnen? Kies dan een nieuw voorvoegsel.`);
  }
  return done(null);
}

/** "2026-0008" voor het logboek. */
export function numberingLabel(n: Numbering): string {
  return formatInvoiceNumber(n.invoicePrefix, n.nextNumber, n.numberPadding);
}

/** IBAN deels afgeschermd voor logboek en e-mail: "NL91 **** 4300". */
export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const clean = normalizeIban(iban);
  return `${clean.slice(0, 4)} **** ${clean.slice(-4)}`;
}

/** Wat er aan de betaalgegevens verandert, afgeschermd: "NL91 **** 4300 → NL02 **** 1234". */
export function paymentTermsChangeLabel(before: string | null | undefined, after: string | null | undefined): string {
  const from = maskIban(extractIban(before)) ?? "geen IBAN";
  const to = maskIban(extractIban(after)) ?? "geen IBAN";
  return from === to ? `${to} (tekst of tenaamstelling gewijzigd)` : `${from} → ${to}`;
}
