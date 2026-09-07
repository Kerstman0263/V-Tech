/**
 * Lineaire afschrijving per maand, berekend (niet opgeslagen).
 *
 * - Start in de maand van aanschaf.
 * - (aanschafprijs - restwaarde) / looptijd in maanden.
 * - Stopt bij het einde van de looptijd of bij afstoten (disposedAt).
 * Fiscaal NL: max 20% per jaar voor de meeste bedrijfsmiddelen (= 60 maanden);
 * de gebruiker mag langer kiezen, korter tonen we als waarschuwing in de UI.
 */
export interface DepreciableAsset {
  purchaseDate: Date;
  purchasePrice: number;
  residualValue: number;
  usefulLifeMonths: number;
  disposedAt?: Date | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Aantal afschrijvingsmaanden t/m de maand van `at` (aanschafmaand telt mee). */
export function monthsElapsed(purchaseDate: Date, at: Date): number {
  const months = (at.getFullYear() - purchaseDate.getFullYear()) * 12 + (at.getMonth() - purchaseDate.getMonth()) + 1;
  return Math.max(0, months);
}

export function monthlyDepreciation(a: DepreciableAsset): number {
  if (a.usefulLifeMonths <= 0) return 0;
  return round2(Math.max(0, a.purchasePrice - a.residualValue) / a.usefulLifeMonths);
}

/** Cumulatief afgeschreven t/m `at` (gestopt bij afstoten). */
export function accumulatedAt(a: DepreciableAsset, at: Date): number {
  const stop = a.disposedAt && a.disposedAt < at ? a.disposedAt : at;
  const months = Math.min(monthsElapsed(a.purchaseDate, stop), a.usefulLifeMonths);
  const total = Math.max(0, a.purchasePrice - a.residualValue);
  // Laatste maand: rest opnemen zodat de som exact op de afschrijfbare waarde uitkomt
  if (months >= a.usefulLifeMonths) return round2(total);
  return round2(months * monthlyDepreciation(a));
}

export function bookValueAt(a: DepreciableAsset, at: Date): number {
  return round2(a.purchasePrice - accumulatedAt(a, at));
}

/** Afschrijvingslast in een kalenderjaar. */
export function depreciationInYear(a: DepreciableAsset, year: number): number {
  const endOfYear = new Date(year, 11, 31, 23, 59, 59);
  const endOfPrev = new Date(year - 1, 11, 31, 23, 59, 59);
  return round2(accumulatedAt(a, endOfYear) - accumulatedAt(a, endOfPrev));
}

/** Afschrijvingslast per maand (1..12) in een jaar — voor de rapportages. */
export function depreciationByMonth(assets: DepreciableAsset[], year: number): number[] {
  const out = Array(12).fill(0) as number[];
  for (let m = 0; m < 12; m++) {
    const end = new Date(year, m + 1, 0, 23, 59, 59);
    const prev = new Date(year, m, 0, 23, 59, 59);
    let sum = 0;
    for (const a of assets) sum += accumulatedAt(a, end) - accumulatedAt(a, prev);
    out[m] = round2(sum);
  }
  return out;
}

export function progress(a: DepreciableAsset, at: Date): { done: number; total: number; pct: number } {
  const stop = a.disposedAt && a.disposedAt < at ? a.disposedAt : at;
  const done = Math.min(monthsElapsed(a.purchaseDate, stop), a.usefulLifeMonths);
  return { done, total: a.usefulLifeMonths, pct: a.usefulLifeMonths > 0 ? Math.min(100, Math.round((done / a.usefulLifeMonths) * 100)) : 100 };
}
