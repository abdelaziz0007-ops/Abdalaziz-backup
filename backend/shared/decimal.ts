/**
 * Exact decimal arithmetic for monetary values (SRS DR-002, DR-003).
 * Values are exact decimal STRINGS in fixtures and state; arithmetic is performed
 * on scaled BigInt minor units. Binary floats are NEVER the authority for balances.
 */
export const CURRENCY_PRECISION = {
  SAR: 2,
  USD: 2,
  BHD: 3, // DR-003: do not assume 2 decimals universally
};

type CurrencyCode = keyof typeof CURRENCY_PRECISION;

export interface Dec {
  /** scaled integer of minor units */
  units: bigint;
  /** number of decimal places represented */
  scale: number;
}

const PATTERN = /^-?\d+(\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return PATTERN.test(value);
}

/** Parse an exact decimal string into scaled minor units at `precision` decimals. */
export function parseDecimal(value: string, precision: number): Dec {
  if (!isDecimalString(value)) {
    throw new Error(`Invalid decimal string: ${value}`);
  }
  const negative = value.startsWith("-");
  const [intPart, fracPart = ""] = (negative ? value.slice(1) : value).split(".");
  if (fracPart.length > precision) {
    throw new Error(`Decimal ${value} exceeds precision ${precision}`);
  }
  const padded = fracPart.padEnd(precision, "0");
  const units = BigInt(intPart + padded);
  return { units: negative ? -units : units, scale: precision };
}

export function addDec(a: Dec, b: Dec): Dec {
  const scale = Math.max(a.scale, b.scale);
  return { units: rescale(a.units, a.scale, scale) + rescale(b.units, b.scale, scale), scale };
}

export function subDec(a: Dec, b: Dec): Dec {
  const scale = Math.max(a.scale, b.scale);
  return { units: rescale(a.units, a.scale, scale) - rescale(b.units, b.scale, scale), scale };
}

export function negateDec(a: Dec): Dec {
  return { units: -a.units, scale: a.scale };
}

export function absDec(a: Dec): Dec {
  return { units: a.units < 0n ? -a.units : a.units, scale: a.scale };
}

export function cmpDec(a: Dec, b: Dec): -1 | 0 | 1 {
  const d = subDec(a, b).units;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

export function isZero(a: Dec): boolean {
  return a.units === 0n;
}

export function sumDec(values: Dec[], precision: number): Dec {
  return values.reduce<Dec>((acc, v) => addDec(acc, v), parseDecimal("0", precision));
}

function rescale(units: bigint, from: number, to: number): bigint {
  if (from === to) return units;
  if (from > to) {
    const factor = 10n ** BigInt(from - to);
    return units / factor; // fixtures are exact at target precision; no rounding path needed
  }
  return units * 10n ** BigInt(to - from);
}

/** Exact string at the given precision (never via float). */
export function formatDec(a: Dec, precision: number): string {
  const scaled = rescale(a.units, a.scale, precision);
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(precision + 1, "0");
  const intPart = digits.slice(0, digits.length - precision) || "0";
  const fracPart = precision > 0 ? digits.slice(digits.length - precision) : "";
  return `${negative ? "-" : ""}${intPart}${precision > 0 ? "." + fracPart : ""}`;
}

/** Convenience for exact decimal strings straight from fixtures. */
export function dec(value: string, currency: CurrencyCode): Dec {
  return parseDecimal(value, CURRENCY_PRECISION[currency]);
}

export function addStr(a: string, b: string, currency: CurrencyCode): string {
  return formatDec(addDec(dec(a, currency), dec(b, currency)), CURRENCY_PRECISION[currency]);
}

export function subStr(a: string, b: string, currency: CurrencyCode): string {
  return formatDec(subDec(dec(a, currency), dec(b, currency)), CURRENCY_PRECISION[currency]);
}

export function sumStr(values: string[], currency: CurrencyCode): string {
  const p = CURRENCY_PRECISION[currency];
  return formatDec(sumDec(values.map((v) => parseDecimal(v, p)), p), p);
}

export function cmpStr(a: string, b: string, currency: CurrencyCode): -1 | 0 | 1 {
  return cmpDec(dec(a, currency), dec(b, currency));
}

export function isZeroStr(value: string, currency: CurrencyCode): boolean {
  return isZero(dec(value, currency));
}

/**
 * Percentage variance per SRS 8.2: (current − comparative) / |comparative| × 100.
 * Returns null for a zero base — callers must render "Unavailable", never a fake number.
 */
export function percentageVariance(current: string, comparative: string, currency: CurrencyCode): string | null {
  return percentageVarianceDec(dec(current, currency), dec(comparative, currency));
}

export function percentageVarianceDec(current: Dec, comparative: Dec): string | null {
  if (isZero(comparative)) return null;
  const num = subDec(current, comparative);
  const den = absDec(comparative);
  // Compute at extra scale (4 dp) using integer arithmetic, then round half-even to 2 dp.
  const scaledNum = num.units * 10000n;
  const denominator = rescale(den.units, den.scale, num.scale);
  const quotient = scaledNum / denominator; // truncates toward zero
  const remainder = scaledNum % denominator;
  let q = quotient;
  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twiceRemainder > denominator || (twiceRemainder === denominator && quotient % 2n !== 0n)) {
    q += scaledNum < 0n ? -1n : 1n;
  }
  // `q` is ratio × 10^4. Percent = ratio × 100, so the minor units of a
  // two-decimal percentage are percent × 100 = ratio × 10^4 = `q` itself.
  // Re-scaling it down by 10^2 would silently drop the ×100 (e.g. 6.67% → 0.06%).
  return formatDec({ units: q, scale: 2 }, 2);
}
