import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getDatabase } from '../database/db';

import en from './locales/en';
import hi from './locales/hi';
import bn from './locales/bn';

export const LANGUAGE_STORAGE_KEY = 'user_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', label: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  bn: { translation: bn },
} as const;

// Initialize i18next instance
i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

/**
 * Loads stored language preference from SQLite database on startup.
 */
export async function initializeLanguage(): Promise<string> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?;',
      [LANGUAGE_STORAGE_KEY]
    );

    if (row && (row.value === 'en' || row.value === 'hi' || row.value === 'bn')) {
      await i18n.changeLanguage(row.value);
      return row.value;
    }
  } catch (error) {
    console.warn('[i18n] Could not read language from SQLite:', error);
  }
  return 'en';
}

/**
 * Changes language immediately and persists the choice to SQLite app_settings.
 */
export async function setAppLanguage(langCode: SupportedLanguageCode): Promise<void> {
  try {
    await i18n.changeLanguage(langCode);
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      [LANGUAGE_STORAGE_KEY, langCode, now]
    );
  } catch (error) {
    console.error(`[i18n] Failed to save language choice "${langCode}":`, error);
  }
}

export default i18n;
