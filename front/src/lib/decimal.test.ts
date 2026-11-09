import { describe, expect, it } from "vitest";
import { parseDecimal, percentageVariance, percentageVarianceDec } from "@/lib/decimal";

/**
 * percentageVariance must return a PERCENT at two decimals per SRS 8.2:
 * (current − comparative) / |comparative| × 100.
 * A scaling regression previously returned the bare ratio (6.67% → "0.06").
 */
describe("percentageVariance", () => {
  it("uses the absolute negative base across exact input scales", () => {
    expect(percentageVarianceDec(parseDecimal("-99.99500000", 8), parseDecimal("-100", 0))).toBe("0.00");
    expect(percentageVarianceDec(parseDecimal("-99.99499999", 8), parseDecimal("-100", 0))).toBe("0.01");
    expect(percentageVarianceDec(parseDecimal("-100.00500001", 8), parseDecimal("-100", 0))).toBe("-0.01");
  });
  const opts = "USD" as const;

  it("returns a percentage, not the bare ratio", () => {
    expect(percentageVariance("128000.00", "120000.00", opts)).toBe("6.67");
    expect(percentageVariance("110.00", "100.00", opts)).toBe("10.00");
    expect(percentageVariance("200.00", "100.00", opts)).toBe("100.00");
  });

  it("keeps the sign of a decline and reports zero variance as 0.00", () => {
    expect(percentageVariance("90.00", "100.00", opts)).toBe("-10.00");
    expect(percentageVariance("100.00", "100.00", opts)).toBe("0.00");
  });

  it("returns null for a zero comparative base instead of a fabricated number", () => {
    expect(percentageVariance("128000.00", "0.00", opts)).toBeNull();
    expect(percentageVariance("0.00", "0.00", opts)).toBeNull();
  });

  it("handles small bases and large exact values without floats", () => {
    expect(percentageVariance("1.00", "0.50", opts)).toBe("100.00");
    expect(percentageVariance("900719925474099312345.67", "900719925474099312345.00", opts)).toBe("0.00");
  });

  it("applies the same rule to three-decimal currencies", () => {
    expect(percentageVariance("1234.567", "1000.000", "BHD")).toBe("23.46");
  });
  it('rounds small declines with the correct sign and ties to even', () => {
    expect(percentageVariance('199.99','200.00',opts)).toBe('0.00');
    expect(percentageVariance('199.98','200.00',opts)).toBe('-0.01');
    expect(percentageVariance('199.97','200.00',opts)).toBe('-0.02');
  });
});
