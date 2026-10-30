import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { COLORS, DARK_COLORS, ColorTheme } from '../constants/theme';
import { getDatabase } from '../database/db';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: ColorTheme;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const THEME_STORAGE_KEY = 'user_theme_mode';

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'light',
  isDark: false,
  colors: COLORS,
  setThemeMode: async () => {},
  toggleTheme: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');

  // Determine actual active dark state
  const isDark =
    themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark');

  const colors = isDark ? (DARK_COLORS as unknown as ColorTheme) : COLORS;

  useEffect(() => {
    // Load stored theme mode on startup from SQLite
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          'SELECT value FROM app_settings WHERE key = ?;',
          [THEME_STORAGE_KEY]
        );
        if (row && (row.value === 'light' || row.value === 'dark' || row.value === 'system')) {
          setThemeModeState(row.value as ThemeMode);
        }
      } catch (e) {
        console.warn('[ThemeContext] Could not load stored theme:', e);
      }
    })();
  }, []);

  const setThemeMode = React.useCallback(async (mode: ThemeMode) => {
    // Instant UI state update
    setThemeModeState(mode);
    // Non-blocking background persistence
    (async () => {
      try {
        const db = await getDatabase();
        const now = new Date().toISOString();
        await db.runAsync(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
          [THEME_STORAGE_KEY, mode, now]
        );
      } catch (e) {
        console.warn('[ThemeContext] Failed to persist theme:', e);
      }
    })();
  }, []);

  const toggleTheme = React.useCallback(async () => {
    const nextMode: ThemeMode = isDark ? 'light' : 'dark';
    await setThemeMode(nextMode);
  }, [isDark, setThemeMode]);

  const contextValue = React.useMemo(
    () => ({
      themeMode,
      isDark,
      colors,
      setThemeMode,
      toggleTheme,
    }),
    [themeMode, isDark, colors, setThemeMode, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
