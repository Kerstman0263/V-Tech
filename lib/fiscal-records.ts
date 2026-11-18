import { fromCents, toCents } from "./money";

export interface FiscalRecords {
  year: number; gross: number; outputVat: number; costs: number; inputVat: number;
  invoices: number; expenses: number; excludedCurrency: number;
}

/** Recorded expense VAT still requires the user's deductibility review. */
export function fiscalRecordValues(records: FiscalRecords, kor: boolean) {
  return {
    gross: records.gross,
    outputVat: kor ? 0 : records.outputVat,
    costs: kor ? records.costs : fromCents(toCents(records.costs) - toCents(records.inputVat)),
    inputVat: kor ? 0 : records.inputVat,
  };
}
