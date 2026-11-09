import { describe, expect, it } from "vitest";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";

describe("formatAmount", () => {
  it("formats English USD without duplicating fractional digits", () => {
    expect(formatAmount("125000.00", "USD", { locale: "en", numerals: "latn" })).toBe("125,000.00");
  });

  it("formats negative, zero, and large exact values", () => {
    const options = { locale: "en" as const, numerals: "latn" as const };
    expect(formatAmount("-1234.50", "USD", options)).toBe("−1,234.50");
    expect(formatAmount("0.00", "USD", options)).toBe("0.00");
    expect(formatAmount("900719925474099312345.67", "USD", options)).toBe("900,719,925,474,099,312,345.67");
  });

  it("uses Arabic separators and Arabic-Indic numerals when requested", () => {
    expect(formatAmount("125000.00", "USD", { locale: "ar", numerals: "arab" })).toBe("١٢٥٬٠٠٠٫٠٠");
  });

  it("preserves three-decimal currencies without changing USD precision", () => {
    expect(formatAmount("1234.567", "BHD", { locale: "en", numerals: "latn" })).toBe("1,234.567");
    expect(formatAmount("125000.00", "USD", { locale: "en", numerals: "latn" })).toBe("125,000.00");
  });

  it("rejects amounts with more precision than their currency allows", () => {
    expect(() => formatAmount("1.001", "USD", { locale: "en", numerals: "latn" })).toThrow();
  });
});

describe("formatDate / formatDateTime", () => {
  const BIDI = /[\u061C\u200E\u200F]/;

  it("renders the Arabic date range in locale order without invisible directional marks", () => {
    const options = { locale: "ar" as const, numerals: "latn" as const };
    const start = formatDate("2026-10-01", options);
    const end = formatDate("2026-10-31", options);
    expect(start).toBe("01/10/2026");
    expect(end).toBe("31/10/2026");
    // Intl emits U+200F inside the pattern; inside an LTR-isolated box it visibly
    // reordered the range to "012026/10/31 — …".
    expect(BIDI.test(`${start} — ${end}`)).toBe(false);
  });

  it("keeps Arabic-Indic numerals when that display preference is selected", () => {
    expect(formatDate("2026-10-01", { locale: "ar", numerals: "arab" })).toBe("٠١/١٠/٢٠٢٦");
  });

  it("keeps the English month/day order", () => {
    expect(formatDate("2026-10-01", { locale: "en", numerals: "latn" })).toBe("10/01/2026");
  });

  it("returns the original value for an unparsable date and never leaks bidi marks", () => {
    expect(formatDate("not-a-date", { locale: "ar", numerals: "latn" })).toBe("not-a-date");
    const stamp = formatDateTime("2026-10-31T10:00:00.000Z", { locale: "ar", numerals: "latn" });
    expect(BIDI.test(stamp)).toBe(false);
    expect(stamp).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
    expect(formatDateTime("not-a-date", { locale: "ar", numerals: "latn" })).toBe("not-a-date");
  });
});
