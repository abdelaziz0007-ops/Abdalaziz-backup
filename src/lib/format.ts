/**
 * Display formatting. Values are exact decimal strings until the final render step.
 * - Numbers are isolated LTR (dir="ltr") so digits never mirror in RTL.
 * - Numerals (Latin / Arabic-Indic) are a display preference only.
 * - Tabular figures are applied via the `tabular` CSS class (font-variant-numeric).
 */
import { CURRENCY_PRECISION, formatDec, parseDecimal } from "@/lib/decimal";
import type { CurrencyCode, Locale, Numerals } from "@/data/types";

export interface FormatOptions {
  locale: Locale;
  numerals: Numerals;
}

function intlLocale(locale: Locale, numerals: Numerals): string {
  // ar → Arabic locale with chosen numbering system; en → Latin digits.
  return numerals === "arab" ? `${locale}-u-nu-arab` : `${locale}-u-nu-latn`;
}

/**
 * `Intl.DateTimeFormat` injects invisible directional marks (U+200F RLM, U+200E LRM,
 * U+061C ALM) into Arabic patterns, e.g. "01\u200F/10\u200F/2026". Rendered inside a
 * `.num-ltr` isolated box those marks open RTL runs and visibly reorder the date
 * ("012026/10/31 — …"). The container already isolates the string, so the marks are
 * stripped here. Locale ordering (dd/MM/yyyy for `ar`) is unchanged.
 */
const BIDI_MARKS = /[\u061C\u200E\u200F]/g;

function stripBidiMarks(value: string): string {
  return value.replace(BIDI_MARKS, "");
}

/** Format an exact decimal string for display. Grouping follows locale conventions. */
export function formatAmount(value: string, currency: CurrencyCode, opts: FormatOptions): string {
  const precision = CURRENCY_PRECISION[currency];
  const exact = formatDec(parseDecimal(value, precision), precision);
  const negative = exact.startsWith("-");
  const [intPart, fraction = ""] = (negative ? exact.slice(1) : exact).split(".");
  const locale = intlLocale(opts.locale, opts.numerals);
  const groupedInteger = new Intl.NumberFormat(locale, {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(BigInt(intPart));

  if (precision === 0) return `${negative ? "−" : ""}${groupedInteger}`;

  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  const decimalSeparator = formatter.formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  const localizedDigits = Array.from({ length: 10 }, (_, digit) => formatter.format(BigInt(digit)));
  const localizedFraction = [...fraction].map((digit) => localizedDigits[Number(digit)]).join("");
  return `${negative ? "−" : ""}${groupedInteger}${decimalSeparator}${localizedFraction}`;
}

/** Amount with currency label, e.g. "125,000.00 ر.س" — label order follows locale. */
export function formatMoney(
  value: string,
  currency: CurrencyCode,
  currencyLabel: string,
  opts: FormatOptions,
): string {
  const amount = formatAmount(value, currency, opts);
  return opts.locale === "ar" ? `${amount} ${currencyLabel}` : `${currencyLabel} ${amount}`;
}

export function formatPercent(value: string, opts: FormatOptions, fractionDigits = 1): string {
  const n = new Intl.NumberFormat(intlLocale(opts.locale, opts.numerals), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value));
  return `${n}٪`;
}

export function formatCount(value: number, opts: FormatOptions): string {
  return new Intl.NumberFormat(intlLocale(opts.locale, opts.numerals)).format(value);
}

/** Accounting dates stored as ISO dates; displayed per locale without altering storage (DR-004). */
export function formatDate(isoDate: string, opts: FormatOptions): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  return stripBidiMarks(
    new Intl.DateTimeFormat(intlLocale(opts.locale, opts.numerals), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      numberingSystem: opts.numerals === "arab" ? "arab" : "latn",
      timeZone: "UTC",
    }).format(date),
  );
}

export function formatDateTime(iso: string, opts: FormatOptions): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return stripBidiMarks(
    new Intl.DateTimeFormat(intlLocale(opts.locale, opts.numerals), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: opts.numerals === "arab" ? "arab" : "latn",
    }).format(date),
  );
}

export function formatAgeDays(days: number, opts: FormatOptions): string {
  return new Intl.NumberFormat(intlLocale(opts.locale, opts.numerals)).format(days);
}
