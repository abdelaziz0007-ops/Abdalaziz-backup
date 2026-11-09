import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Density, Locale, Numerals, Theme } from "@/data/types";

/**
 * Global display preferences. Persisted locally as demo preferences only.
 * Never stores credentials or uploaded file contents.
 */
const STORAGE_KEY = "fw.demo.preferences.v1";

interface Preferences {
  locale: Locale;
  theme: Theme;
  density: Density;
  numerals: Numerals;
}

interface PreferencesContextValue extends Preferences {
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setNumerals: (n: Numerals) => void;
  resetPreferences: () => void;
}

const DEFAULTS: Preferences = { locale: "ar", theme: "light", density: "comfortable", numerals: "latn" };

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      locale: parsed.locale === "en" ? "en" : "ar",
      theme: parsed.theme === "dark" ? "dark" : "light",
      density: parsed.density === "compact" ? "compact" : "comfortable",
      numerals: parsed.numerals === "arab" ? "arab" : "latn",
    };
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);

  const dir = prefs.locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    const html = document.documentElement;
    html.lang = prefs.locale;
    html.dir = dir;
    html.dataset.theme = prefs.theme;
    html.dataset.density = prefs.density;
    html.dataset.numerals = prefs.numerals;
  }, [prefs.locale, prefs.theme, prefs.density, prefs.numerals, dir]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — preferences remain in memory */
    }
  }, [prefs]);

  const setLocale = useCallback((locale: Locale) => setPrefs((p) => ({ ...p, locale })), []);
  const setTheme = useCallback((theme: Theme) => setPrefs((p) => ({ ...p, theme })), []);
  const setDensity = useCallback((density: Density) => setPrefs((p) => ({ ...p, density })), []);
  const setNumerals = useCallback((numerals: Numerals) => setPrefs((p) => ({ ...p, numerals })), []);
  const resetPreferences = useCallback(() => setPrefs(DEFAULTS), []);

  const value = useMemo<PreferencesContextValue>(
    () => ({ ...prefs, dir, setLocale, setTheme, setDensity, setNumerals, resetPreferences }),
    [prefs, dir, setLocale, setTheme, setDensity, setNumerals, resetPreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
