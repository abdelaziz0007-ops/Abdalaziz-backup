import { useCallback } from "react";
import { usePreferences } from "@/state/PreferencesProvider";
import { translate } from "@/lib/copy";
import { formatAmount, formatCount, formatDate, formatDateTime, formatMoney, formatPercent, type FormatOptions } from "@/lib/format";
import type { CurrencyCode } from "@/data/types";
import { fixtures } from "@/data/repository";

/** Locale-bound translation helper. */
export function useCopy() {
  const { locale } = usePreferences();
  return useCallback((key: string) => translate(key, locale), [locale]);
}

/** Locale/numerals-bound formatting helper + currency label lookup. */
export function useFormat() {
  const { locale, numerals } = usePreferences();
  const opts: FormatOptions = { locale, numerals };
  const currencyLabel = useCallback(
    (code: CurrencyCode) => fixtures.currencies[code]?.symbol[locale] ?? code,
    [locale],
  );
  return {
    opts,
    amount: (value: string, currency: CurrencyCode) => formatAmount(value, currency, opts),
    money: (value: string, currency: CurrencyCode) =>
      formatMoney(value, currency, currencyLabel(currency), opts),
    percent: (value: string, digits?: number) => formatPercent(value, opts, digits),
    count: (value: number) => formatCount(value, opts),
    date: (iso: string) => formatDate(iso, opts),
    dateTime: (iso: string) => formatDateTime(iso, opts),
    currencyLabel,
  };
}
