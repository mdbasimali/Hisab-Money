import type { SQLiteDatabase } from 'expo-sqlite';

let Platform: any = { OS: 'android' };
try {
  Platform = require('react-native').Platform;
} catch (e) {
  Platform = { OS: typeof window !== 'undefined' ? 'web' : 'android' };
}

let SecureStore: any = null;
try {
  SecureStore = require('expo-secure-store');
} catch (e) {
  // Safe fallback in web or testing environments
}

const getDb = async (): Promise<SQLiteDatabase> => {
  const { getDatabase } = require('../database/db');
  return getDatabase();
};

export const CURRENT_PRIVACY_POLICY_VERSION = '1.0.0';
export const PRIVACY_POLICY_EFFECTIVE_DATE = '2026-10-28';

const SECURE_STORE_CONSENT_KEY = 'paisa_khata_privacy_consent';
const DB_SETTING_AGREED_KEY = 'privacy_policy_consent_agreed';
const DB_SETTING_VERSION_KEY = 'privacy_policy_consent_version';
const DB_SETTING_TIMESTAMP_KEY = 'privacy_policy_consent_timestamp';

export interface PrivacyConsentRecord {
  hasConsented: boolean;
  version: string | null;
  timestamp: string | null;
}

export class PrivacyConsentService {
  private static cachedConsent: PrivacyConsentRecord | null = null;

  /**
   * Compare two semver-like version strings (e.g. '1.0.0' vs '1.0.1').
   * Returns:
   *   1 if v1 > v2
   *  -1 if v1 < v2
   *   0 if equal
   */
  static compareVersions(v1: string, v2: string): number {
    const parts1 = v1.replace(/^v/, '').split('.').map((p) => parseInt(p, 10) || 0);
    const parts2 = v2.replace(/^v/, '').split('.').map((p) => parseInt(p, 10) || 0);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
      const p1 = parts1[i] ?? 0;
      const p2 = parts2[i] ?? 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * Retrieve the persisted consent record from SecureStore and/or SQLite.
   */
  static async getStoredConsent(): Promise<PrivacyConsentRecord> {
    if (this.cachedConsent) {
      return this.cachedConsent;
    }

    try {
      // 1. Try SecureStore / localStorage
      let rawJson: string | null = null;
      if (Platform.OS === 'web' || !SecureStore?.getItemAsync) {
        if (typeof localStorage !== 'undefined') {
          rawJson = localStorage.getItem(SECURE_STORE_CONSENT_KEY);
        }
      } else {
        rawJson = await SecureStore.getItemAsync(SECURE_STORE_CONSENT_KEY);
      }

      if (rawJson) {
        try {
          const parsed = JSON.parse(rawJson);
          if (parsed && typeof parsed.hasConsented === 'boolean') {
            const record: PrivacyConsentRecord = {
              hasConsented: parsed.hasConsented,
              version: parsed.version || null,
              timestamp: parsed.timestamp || null,
            };
            this.cachedConsent = record;
            return record;
          }
        } catch {
          // JSON parse failed; fall through to SQLite
        }
      }

      // 2. Fallback to SQLite app_settings table
      const db = await getDb();
      const versionRow = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?;',
        [DB_SETTING_VERSION_KEY]
      );
      const timestampRow = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?;',
        [DB_SETTING_TIMESTAMP_KEY]
      );
      const agreedRow = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?;',
        [DB_SETTING_AGREED_KEY]
      );

      if (agreedRow && agreedRow.value === 'true' && versionRow?.value) {
        const record: PrivacyConsentRecord = {
          hasConsented: true,
          version: versionRow.value,
          timestamp: timestampRow?.value || null,
        };
        this.cachedConsent = record;
        return record;
      }
    } catch (err) {
      console.warn('[PrivacyConsentService] Error reading stored consent:', err);
    }

    const defaultRecord: PrivacyConsentRecord = {
      hasConsented: false,
      version: null,
      timestamp: null,
    };
    this.cachedConsent = defaultRecord;
    return defaultRecord;
  }

  /**
   * Determine whether active user consent is required.
   * Returns:
   *   false: if the user has already consented to the CURRENT_PRIVACY_POLICY_VERSION
   *   true:  if the user has never consented OR if stored consent is older than CURRENT_PRIVACY_POLICY_VERSION
   */
  static async isConsentRequired(currentVersion = CURRENT_PRIVACY_POLICY_VERSION): Promise<boolean> {
    const record = await this.getStoredConsent();
    if (!record.hasConsented || !record.version) {
      return true;
    }
    // If user accepted this exact version or higher, no new consent is required
    return this.compareVersions(record.version, currentVersion) < 0;
  }

  /**
   * Determine if the user's stored consent is from a superseded (older) policy version.
   */
  static async isPolicyUpdated(currentVersion = CURRENT_PRIVACY_POLICY_VERSION): Promise<boolean> {
    const record = await this.getStoredConsent();
    return !!(record.hasConsented && record.version && this.compareVersions(record.version, currentVersion) < 0);
  }

  /**
   * Explicitly record and persist user consent with policy version and timestamp.
   * This is separated from Google authentication tokens.
   */
  static async recordConsent(
    version = CURRENT_PRIVACY_POLICY_VERSION,
    timestampOverride?: string
  ): Promise<PrivacyConsentRecord> {
    const timestamp = timestampOverride || new Date().toISOString();
    const record: PrivacyConsentRecord = {
      hasConsented: true,
      version,
      timestamp,
    };

    this.cachedConsent = record;

    // 1. Store in SecureStore / localStorage
    try {
      const serialized = JSON.stringify(record);
      if (Platform.OS === 'web' || !SecureStore?.setItemAsync) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SECURE_STORE_CONSENT_KEY, serialized);
        }
      } else {
        await SecureStore.setItemAsync(SECURE_STORE_CONSENT_KEY, serialized);
      }
    } catch (e) {
      console.warn('[PrivacyConsentService] Error writing to SecureStore:', e);
    }

    // 2. Store in SQLite app_settings
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [DB_SETTING_AGREED_KEY, 'true', now]
      );
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [DB_SETTING_VERSION_KEY, version, now]
      );
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [DB_SETTING_TIMESTAMP_KEY, timestamp, now]
      );
    } catch (e) {
      console.warn('[PrivacyConsentService] Error writing to SQLite:', e);
    }

    return record;
  }

  /**
   * Reset consent (primarily for testing and policy upgrade scenarios)
   */
  static async clearConsentForTesting(): Promise<void> {
    this.cachedConsent = null;
    try {
      if (Platform.OS === 'web' || !SecureStore?.deleteItemAsync) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(SECURE_STORE_CONSENT_KEY);
        }
      } else {
        await SecureStore.deleteItemAsync(SECURE_STORE_CONSENT_KEY);
      }
    } catch {}

    try {
      const db = await getDb();
      await db.runAsync(
        `DELETE FROM app_settings WHERE key IN (?, ?, ?);`,
        [DB_SETTING_AGREED_KEY, DB_SETTING_VERSION_KEY, DB_SETTING_TIMESTAMP_KEY]
      );
    } catch {}
  }
}
