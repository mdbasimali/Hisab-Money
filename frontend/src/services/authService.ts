import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getDatabase } from '../database/db';

const TOKEN_KEY = 'hisab_khata_auth_token';
const USER_KEY = 'hisab_khata_auth_user';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  businessName?: string;
  phone?: string;
  avatarUrl?: string;
  picture?: string;
  photoUrl?: string;
  customName?: string;
}

export class AuthService {
  private static cachedToken: string | null = null;
  private static cachedUser: AuthUser | null = null;

  /**
   * Synchronously return cached user if already loaded
   */
  static getCachedUser(): AuthUser | null {
    return this.cachedUser;
  }

  /**
   * Save authentication token to secure storage
   */
  static async setToken(token: string): Promise<void> {
    this.cachedToken = token;
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      }
    } catch (e) {
      console.warn('[AuthService] Error storing token securely:', e);
    }
  }

  /**
   * Retrieve authentication token from secure storage
   */
  static async getToken(): Promise<string | null> {
    if (this.cachedToken) return this.cachedToken;

    try {
      let token: string | null = null;
      if (Platform.OS === 'web') {
        token = localStorage.getItem(TOKEN_KEY);
      } else {
        token = await SecureStore.getItemAsync(TOKEN_KEY);
      }
      this.cachedToken = token;
      return token;
    } catch (e) {
      console.warn('[AuthService] Error reading secure token:', e);
      return null;
    }
  }

  /**
   * Save user profile
   */
  static async setUser(user: AuthUser): Promise<void> {
    const customName = user.customName || this.cachedUser?.customName;
    const mergedUser: AuthUser = {
      ...user,
      ...(customName ? { customName } : {}),
    };
    this.cachedUser = mergedUser;
    try {
      const serialized = JSON.stringify(mergedUser);
      if (Platform.OS === 'web') {
        localStorage.setItem(USER_KEY, serialized);
      } else {
        await SecureStore.setItemAsync(USER_KEY, serialized);
      }
    } catch (e) {
      console.warn('[AuthService] Error storing user profile:', e);
    }
  }

  /**
   * Helper to fetch persisted custom profile name from SQLite app_settings
   */
  private static async getCustomNameFromDb(): Promise<string | null> {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?;',
        ['custom_profile_name']
      );
      return row?.value ? row.value.trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieve custom profile name
   */
  static async getCustomName(): Promise<string | null> {
    if (this.cachedUser?.customName) return this.cachedUser.customName;
    return await this.getCustomNameFromDb();
  }

  /**
   * Set custom display name locally in SQLite and SecureStore
   */
  static async setCustomName(customName: string | null): Promise<void> {
    const trimmed = customName ? customName.trim() : '';

    // 1. Persist to SQLite app_settings
    try {
      const db = await getDatabase();
      if (trimmed) {
        await db.runAsync(
          `INSERT INTO app_settings (key, value, updated_at) VALUES ('custom_profile_name', ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
          [trimmed, new Date().toISOString()]
        );
      } else {
        await db.runAsync("DELETE FROM app_settings WHERE key = 'custom_profile_name';");
      }
    } catch (e) {
      console.warn('[AuthService] Error persisting custom name to SQLite:', e);
    }

    // 2. Update cached and stored AuthUser
    try {
      const user = await this.getUser();
      if (user) {
        const updated: AuthUser = {
          ...user,
          customName: trimmed || undefined,
        };
        await this.setUser(updated);
      } else if (trimmed) {
        this.cachedUser = {
          id: 'local_user',
          name: 'Google User',
          email: '',
          customName: trimmed,
        };
      }
    } catch (e) {
      console.warn('[AuthService] Error updating user in storage:', e);
    }
  }

  /**
   * Retrieve user profile
   */
  static async getUser(): Promise<AuthUser | null> {
    if (this.cachedUser) {
      if (!this.cachedUser.customName) {
        const custom = await this.getCustomNameFromDb();
        if (custom) this.cachedUser.customName = custom;
      }
      return this.cachedUser;
    }

    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        raw = localStorage.getItem(USER_KEY);
      } else {
        raw = await SecureStore.getItemAsync(USER_KEY);
      }

      if (raw) {
        this.cachedUser = JSON.parse(raw);
        if (this.cachedUser && !this.cachedUser.customName) {
          const custom = await this.getCustomNameFromDb();
          if (custom && this.cachedUser) {
            this.cachedUser.customName = custom;
          }
        }
        return this.cachedUser;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if user is currently logged in
   */
  static async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * Logout user by clearing credentials from memory and secure store
   * CRITICAL: Preserves local SQLite database records!
   */
  static async logout(): Promise<void> {
    this.cachedToken = null;
    this.cachedUser = null;

    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(USER_KEY);
      }

      // Clear Google Play Services session so user can pick any account next time
      try {
        const RNSignIn = require('@react-native-google-signin/google-signin');
        if (RNSignIn?.GoogleSignin) {
          await RNSignIn.GoogleSignin.signOut();
        }
      } catch (e) {
        // Ignored if not running in native build
      }

      // Clear Google Drive authorization state and reset prompt flag upon logout
      try {
        const { GoogleDriveBackupService } = require('./googleDriveService');
        await GoogleDriveBackupService.disconnectGoogleDrive();
        await GoogleDriveBackupService.setFirstDrivePromptHandled(false);
      } catch {}
    } catch (e) {
      console.warn('[AuthService] Error deleting secure credentials:', e);
    }
  }
}
