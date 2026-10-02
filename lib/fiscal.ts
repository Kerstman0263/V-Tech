import { FISCAL_RATES, FISCAL_YEARS, type FiscalYear } from "./fiscal-rates";
import { fromCents, percentageOfCents, toCents } from "./money";

export const MAX_FISCAL_AMOUNT = 99_999_999.99;
export type FiscalPeriod = "year" | "quarter" | "month";

export interface FiscalReserveInput {
  year: FiscalYear;
  mode: "ib" | "vpb";
  kor: boolean;
  period: FiscalPeriod;
  /** Revenue for the selected period, including output VAT. Not bank balance. */
  gross: number;
  /** Deductible business costs, excluding recoverable VAT (including VAT under KOR). */
  costs: number;
  vatRate: 0 | 9 | 21;
  /** Actual deductible VAT; never inferred from costs or the sales VAT rate. */
  inputVat: number;
  /** Optional actual output VAT for mixed rates; gross must include this amount. */
  outputVat?: number;
  /** Personal reserve choice, NOT an official income-tax rate or tax assessment. */
  ibPercent: number;
  safetyPercent: number;
  /** Optional full-year profit projection after costs; no automatic tax deductions. */
  annualProfit?: number;
}

function amount(value: number, allowNegative = false): number {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_FISCAL_AMOUNT || (!allowNegative && value < 0)) {
    throw new RangeError("Invalid fiscal amount");
  }
  const cents = toCents(value);
  if (fromCents(cents) !== value) throw new RangeError("Fiscal amounts require at most two decimals");
  return cents;
}

/** Round a ratio of nonnegative integer cents, without floating-point drift. */
function ratio(cents: number, numerator: number, denominator: number): number {
  return Number((BigInt(cents) * BigInt(numerator) * 2n + BigInt(denominator)) / (2n * BigInt(denominator)));
}

/**
 * A period-based reserve scenario, not an income-tax return or cash-flow ledger.
 * Annual Zvw caps/VPB brackets apply BEFORE allocating a share to the period.
 * The unadjusted profit base deliberately does not assume entitlement to any
 * personal deductions, credits, loss carryforward or unused Zvw contribution room.
 * A refund is shown separately and never funds the displayed remaining profit.
 */
export function calculateFiscalReserve(input: FiscalReserveInput) {
  if (!FISCAL_YEARS.includes(input.year)) throw new RangeError("Unsupported fiscal year");
  if (input.mode !== "ib" && input.mode !== "vpb") throw new RangeError("Invalid tax mode");
  if (typeof input.kor !== "boolean") throw new RangeError("Invalid KOR status");
  const periodsPerYear = ({ year: 1, quarter: 4, month: 12 } as const)[input.period];
  if (typeof periodsPerYear !== "number") throw new RangeError("Invalid fiscal period");
  if (![0, 9, 21].includes(input.vatRate)) throw new RangeError("Invalid VAT rate");
  if (!Number.isFinite(input.ibPercent) || input.ibPercent < 0 || input.ibPercent > 60 ||
      !Number.isFinite(input.safetyPercent) || input.safetyPercent < 0 || input.safetyPercent > 30) {
    throw new RangeError("Invalid reserve percentage");
  }

  const rates = FISCAL_RATES[input.year];
  const gross = amount(input.gross);
  const costs = amount(input.costs);
  const suppliedInputVat = amount(input.inputVat);
  const suppliedOutputVat = input.outputVat === undefined ? undefined : amount(input.outputVat);
  if (suppliedOutputVat !== undefined && suppliedOutputVat > gross) throw new RangeError("VAT exceeds revenue");
  const outputVat = input.kor ? 0 : suppliedOutputVat ?? ratio(gross, input.vatRate, 100 + input.vatRate);
  const inputVat = input.kor ? 0 : suppliedInputVat;
  const revenueExVat = gross - outputVat;
  const netVat = outputVat - inputVat;
  const vatReserve = Math.max(0, netVat);
  const vatRefund = Math.max(0, -netVat);
  const profit = revenueExVat - costs;
  // Retain losses in the explanation; clamp only the current tax reserve base.
  const annualProfit = input.annualProfit === undefined ? profit * periodsPerYear : amount(input.annualProfit, true);
  const positiveAnnualProfit = Math.max(0, annualProfit);
  const annualZvw = input.mode === "vpb" ? 0 : percentageOfCents(
    Math.min(positiveAnnualProfit, toCents(rates.zvw.maxIncome)), rates.zvw.rate * 100,
  );
  const threshold = toCents(rates.vpb.threshold);
  const annualProfitTax = input.mode === "vpb"
    ? percentageOfCents(Math.min(positiveAnnualProfit, threshold), rates.vpb.lowRate * 100) +
      percentageOfCents(Math.max(0, positiveAnnualProfit - threshold), rates.vpb.highRate * 100)
    : percentageOfCents(positiveAnnualProfit, input.ibPercent);
  const taxReserve = ratio(annualProfitTax, 1, periodsPerYear);
  const zvwReserve = ratio(annualZvw, 1, periodsPerYear);
  const baseBuffer = vatReserve + taxReserve + zvwReserve;
  const safetyReserve = percentageOfCents(baseBuffer, input.safetyPercent);
  const totalBuffer = baseBuffer + safetyReserve;
  // VAT has already been removed from profit. Subtract only profit reserves and
  // the entire extra margin, not output VAT for a second time.
  const remaining = profit - taxReserve - zvwReserve - safetyReserve;

  return {
    periodsPerYear,
    revenueExVat: fromCents(revenueExVat), outputVat: fromCents(outputVat), inputVat: fromCents(inputVat),
    netVat: fromCents(netVat), vatReserve: fromCents(vatReserve), vatRefund: fromCents(vatRefund),
    profit: fromCents(profit), annualProfit: fromCents(annualProfit), annualZvw: fromCents(annualZvw),
    annualProfitTax: fromCents(annualProfitTax), taxReserve: fromCents(taxReserve), zvwReserve: fromCents(zvwReserve),
    baseBuffer: fromCents(baseBuffer), safetyReserve: fromCents(safetyReserve), totalBuffer: fromCents(totalBuffer),
    remainingProfit: fromCents(Math.max(0, remaining)), shortfall: fromCents(Math.max(0, -remaining)),
    korThresholdExceeded: input.kor && revenueExVat > toCents(rates.korThreshold),
    projectedKorThresholdExceeded: input.kor && revenueExVat * periodsPerYear > toCents(rates.korThreshold),
  };
}
