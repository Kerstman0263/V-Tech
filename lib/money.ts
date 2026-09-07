/** Decimal arithmetic at the boundary; integer cents for stored money. */
function fraction(value: number): [bigint, bigint] {
  if (!Number.isFinite(value)) throw new RangeError("Invalid monetary value");
  const [mantissa, exponent = "0"] = value.toString().toLowerCase().split("e");
  const decimals = mantissa.split(".")[1]?.length ?? 0;
  const power = Number(exponent) - decimals;
  const numerator = BigInt(mantissa.replace(".", ""));
  return power >= 0 ? [numerator * 10n ** BigInt(power), 1n] : [numerator, 10n ** BigInt(-power)];
}

function rounded(numerator: bigint, denominator: bigint): number {
  const sign = numerator < 0n ? -1n : 1n;
  const value = Number(sign * ((numerator * sign * 2n + denominator) / (denominator * 2n)));
  if (!Number.isSafeInteger(value)) throw new RangeError("Monetary value is too large");
  return value;
}

export function toCents(amount: number): number {
  const [n, d] = fraction(amount);
  return rounded(n * 100n, d);
}

export function fromCents(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Invalid cents");
  return cents / 100;
}

export function multiplyToCents(quantity: number, price: number): number {
  const [qn, qd] = fraction(quantity);
  const [pn, pd] = fraction(price);
  return rounded(qn * pn * 100n, qd * pd);
}

export function percentageOfCents(cents: number, percent: number): number {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Invalid cents");
  const [n, d] = fraction(percent);
  return rounded(BigInt(cents) * n, d * 100n);
}
